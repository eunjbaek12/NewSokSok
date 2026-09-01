import { useEffect } from 'react';
import { Alert, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
// 컴포넌트 밖(모듈 함수)에서 뜨는 Alert이라 훅을 쓸 수 없다 — i18n 인스턴스를 직접 쓴다.
import i18n from '@/i18n';
import { useAuth, isCloudAuthMode } from '@/features/auth';
import {
  flushPush,
  pullChanges,
  useSyncStore,
  probeFirstLoginState,
  applyFirstLoginMerge,
  applyFirstLoginCloudReset,
  markAllLocalDirty,
  markAllLocalStatsDirty,
} from '@/features/sync';
import { initSeedDataIfEmpty, clearAllData } from './db';
import { buildSeedData } from './seed';
import { invalidateLists } from './queries';

const LAST_GOOGLE_ID_KEY = '@soksok_last_google_id';

interface BootstrapState {
  loading: boolean;
  setLoading: (value: boolean) => void;
}

const useBootstrapStore = create<BootstrapState>((set) => ({
  loading: true,
  setLoading: (value) => set({ loading: value }),
}));

export function useBootstrapLoading(): boolean {
  return useBootstrapStore(s => s.loading);
}

async function chooseConflictResolution(cloudWordCount: number, localWordCount: number): Promise<'merge' | 'cloud'> {
  // A cloud reset permanently removes guest-local words/stats. If the user
  // backs out of the destructive confirmation, return to the original choice
  // instead of silently treating that as a cloud reset or a cancellation.
  for (;;) {
    const choice = await new Promise<'merge' | 'cloud'>((resolve) => {
      Alert.alert(
        i18n.t('bootstrap.conflictTitle'),
        i18n.t('bootstrap.conflictMessage', { cloud: cloudWordCount, local: localWordCount }),
        [
          { text: i18n.t('bootstrap.merge'), onPress: () => resolve('merge') },
          { text: i18n.t('bootstrap.keepCloud'), style: 'destructive', onPress: () => resolve('cloud') },
        ],
        { cancelable: false },
      );
    });
    if (choice === 'merge') return choice;

    const confirmed = await new Promise<boolean>((resolve) => {
      Alert.alert(
        i18n.t('bootstrap.confirmCloudResetTitle'),
        i18n.t('bootstrap.confirmCloudResetMessage'),
        [
          { text: i18n.t('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
          { text: i18n.t('bootstrap.confirmCloudReset'), style: 'destructive', onPress: () => resolve(true) },
        ],
        { cancelable: false },
      );
    });
    if (confirmed) return 'cloud';
  }
}

async function loadCloudData(): Promise<void> {
  const { lastPulledAt } = useSyncStore.getState();

  try {
    if (lastPulledAt === 0) {
      const { state, cloudWordCount, localWordCount } = await probeFirstLoginState();
      if (state === 'conflict') {
        const choice = await chooseConflictResolution(cloudWordCount, localWordCount);
        if (choice === 'merge') await applyFirstLoginMerge();
        else await applyFirstLoginCloudReset();
      } else if (state === 'local-only') {
        await markAllLocalDirty();
      }
      // 게스트 시절 학습 통계(스트릭·달력) 업로드 — 단어 probe 분기와 무관하게
      // 모든 첫 로그인에서. cloud-reset 뒤에는 테이블이 비어 있어 no-op.
      await markAllLocalStatsDirty();
    }

    await pullChanges();
    if (useSyncStore.getState().dirtyListIds.size > 0 ||
        useSyncStore.getState().dirtyWordIds.size > 0 ||
        useSyncStore.getState().dirtyStatDates.size > 0) {
      await flushPush();
    }
  } catch (e: any) {
    console.warn('Cloud data load failed:', e?.message ?? e);
    Alert.alert(
      i18n.t('bootstrap.syncErrorTitle'),
      i18n.t('bootstrap.syncErrorMessage', { detail: e?.message ?? String(e) }),
    );
  }
}

export function useVocabBootstrap(): void {
  const { authMode, user } = useAuth();

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      // 🔴 `.catch`가 없으면 여기서 난 실패는 unhandled rejection으로 **로그에도 안 남는다.**
      //    하필 여기가 가장 끊기기 쉬운 자리다 — OS가 네트워크를 끊는 바로 그 순간에 나가는
      //    push라, 2026-09-01엔 단어장만 올라가고 단어에서 잘렸는데 흔적이 하나도 없었다.
      //    실패한 push의 재시도는 flushPush가 예약한다(engine.ts RETRY_BACKOFF_MS).
      if (state !== 'active') {
        void flushPush().catch(e =>
          console.warn('[sync] background push failed:', e?.message ?? e),
        );
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    let cancelled = false;
    useBootstrapStore.getState().setLoading(true);

    const run = async () => {
      if (isCloudAuthMode(authMode) && user?.id) {
        // Account-switch guard (safety net for paths that bypass logout(): app
        // reinstall, restored session on a different account, etc.). If the
        // device last synced under a *different* google id, the local SQLite
        // and sync watermark belong to that other account — wipe them so the
        // pull below repopulates from this account instead of leaking the old
        // account's words.
        let accountSwitched = false;
        const prevId = await AsyncStorage.getItem(LAST_GOOGLE_ID_KEY);
        if (prevId && prevId !== user.id) {
          accountSwitched = true;
          await clearAllData();
          await useSyncStore.getState().resetAll();
          // Mirror logout's account-scoped settings + quota clear so nickname,
          // custom study selection, BYOK key, and tier status from the previous
          // account don't leak in (e.g. if the previous session was ended by
          // app reinstall or by signing in as a different account without
          // going through logout()).
          try {
            const { useSettingsStore } = await import('@/features/settings/store');
            await useSettingsStore.getState().clearAccountScopedSettings();
            const { useQuotaStore } = await import('@/features/quota');
            useQuotaStore.getState().clear();
            // The previous account's local data was just wiped, so any "preserved
            // cloud data" flag from its offline logout is now stale — clear it so
            // a future guest entry doesn't prompt for data that no longer exists.
            const { clearPreservedCloudData } = await import('@/features/auth/preserved-cloud-data');
            await clearPreservedCloudData();
          } catch (e: any) {
            console.warn('[bootstrap] settings clear failed:', e?.message ?? e);
          }
        }
        await AsyncStorage.setItem(LAST_GOOGLE_ID_KEY, user.id);
        // Restore the nickname backed up to Supabase user_metadata. logout()
        // clears the local copy for account isolation, so without this a
        // re-login (same account) would leave the nickname blank — it'd appear
        // to "reset" on every logout. Only restore when local is empty so we
        // never clobber an edit the user just made in this session.
        if (user.nickname) {
          try {
            const { useSettingsStore } = await import('@/features/settings/store');
            const local = useSettingsStore.getState().profileSettings.nickname.trim();
            if (!local) {
              await useSettingsStore.getState().updateProfileSettings({ nickname: user.nickname });
            }
          } catch (e: any) {
            console.warn('[bootstrap] nickname restore failed:', e?.message ?? e);
          }
        }
        await useSyncStore.getState().hydrateLastPulled();
        // Restore pending (un-pushed) dirty ids so a delete/edit made just
        // before a reload or crash still reaches the cloud on this launch.
        await useSyncStore.getState().hydrateDirty();

        // 클라우드 왕복(pull 드레인 + push)은 홈을 막을 이유가 없다 — 평상시
        // 실행에서는 로컬 SQLite에 이미 이 계정의 데이터가 그대로 있으므로 그
        // 스냅샷으로 홈을 먼저 그리고, 동기화는 뒤에서 돌린 뒤 끝나면 목록을
        // 무효화해 화면을 갱신한다. 앱 시작 때마다 네트워크가 끝날 때까지
        // 스피너만 보이던 게 이 await였다.
        //
        // 단, 로컬에 보여줄 게 없는 두 경우는 그대로 기다린다:
        //  - 첫 동기화(lastPulledAt === 0): 아직 아무것도 안 받아왔다. 첫 로그인
        //    conflict Alert(합치기/클라우드 유지)도 이 경로라 반드시 blocking.
        //  - 계정 전환: 바로 위에서 clearAllData()로 로컬을 비웠다. 기다리지 않으면
        //    빈 홈이 잠깐 보였다가 채워진다.
        const needsBlockingSync =
          accountSwitched || useSyncStore.getState().lastPulledAt === 0;

        if (needsBlockingSync) {
          await loadCloudData();
        } else {
          void loadCloudData()
            .then(() => {
              if (!cancelled) return invalidateLists();
            })
            .catch(e => console.warn('[bootstrap] background sync failed:', e?.message ?? e));
        }
      } else {
        // Intentionally KEEP @soksok_last_google_id across logout/guest. It is
        // the input to the account-switch guard above, so preserving it lets
        // that guard wipe local data when a *different* account next logs in.
        // This matters because logout() now preserves local data when its
        // pre-logout flush couldn't drain unsynced changes (offline logout) —
        // without a sticky last-id, a different account could then merge into
        // the preserved data. A same-account re-login sees prevId === user.id
        // and skips the wipe, so nothing is lost there.
        // Seed sample data ONLY for guest mode (first-run experience). Do NOT
        // seed in mode='none' (the brief logged-out window right after
        // logout): logout clears local data, so seeding here would refill it
        // with samples, and on the next google sign-in those samples collide
        // with the account's cloud data → first-login "conflict" branch that
        // blocks the cloud pull. That's how an account's words appear to
        // vanish after a logout/login round-trip even though they're safe in
        // the cloud.
        if (authMode === 'guest') {
          await initSeedDataIfEmpty(buildSeedData());
        }
      }
      await invalidateLists();
      if (!cancelled) useBootstrapStore.getState().setLoading(false);
    };

    run();
    return () => { cancelled = true; };
  }, [authMode, user?.id]);
}
