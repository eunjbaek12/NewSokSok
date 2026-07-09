import { useEffect } from 'react';
import { Alert, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
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

async function loadCloudData(): Promise<void> {
  const { lastPulledAt } = useSyncStore.getState();

  try {
    if (lastPulledAt === 0) {
      const { state, cloudWordCount, localWordCount } = await probeFirstLoginState();
      if (state === 'conflict') {
        const choice = await new Promise<'merge' | 'cloud'>((resolve) => {
          Alert.alert(
            '데이터 선택',
            `클라우드에 ${cloudWordCount}개, 이 기기에 ${localWordCount}개 단어가 있습니다. 어떻게 할까요?`,
            [
              { text: '합치기', onPress: () => resolve('merge') },
              { text: '클라우드 유지', style: 'destructive', onPress: () => resolve('cloud') },
            ],
            { cancelable: false },
          );
        });
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
    Alert.alert('동기화 오류', `클라우드 동기화에 실패했습니다.\n${e?.message ?? String(e)}`);
  }
}

export function useVocabBootstrap(): void {
  const { authMode, user } = useAuth();

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') void flushPush();
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
        const prevId = await AsyncStorage.getItem(LAST_GOOGLE_ID_KEY);
        if (prevId && prevId !== user.id) {
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
        await loadCloudData();
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
          await initSeedDataIfEmpty();
        }
      }
      await invalidateLists();
      if (!cancelled) useBootstrapStore.getState().setLoading(false);
    };

    run();
    return () => { cancelled = true; };
  }, [authMode, user?.id]);
}
