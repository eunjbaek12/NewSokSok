import { useEffect } from 'react';
import { Alert, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { useAuth } from '@/features/auth';
import {
  flushPush,
  pullChanges,
  useSyncStore,
  probeFirstLoginState,
  applyFirstLoginMerge,
  applyFirstLoginCloudReset,
  markAllLocalDirty,
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
    }

    await pullChanges();
    if (useSyncStore.getState().dirtyListIds.size > 0 ||
        useSyncStore.getState().dirtyWordIds.size > 0) {
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
      if (authMode === 'google' && user?.id) {
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
          } catch (e: any) {
            console.warn('[bootstrap] settings clear failed:', e?.message ?? e);
          }
        }
        await AsyncStorage.setItem(LAST_GOOGLE_ID_KEY, user.id);
        await useSyncStore.getState().hydrateLastPulled();
        await loadCloudData();
      } else {
        await AsyncStorage.removeItem(LAST_GOOGLE_ID_KEY);
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
