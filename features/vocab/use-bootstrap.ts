/**
 * App-boot orchestrator for the vocab feature.
 *
 * Two-layer design (step 7c-4c refactor):
 *
 * - `useVocabBootstrap()` — the side-effect hook. MUST be mounted **once**
 *   at the app root (`app/_layout.tsx`). It watches the auth identity and
 *   runs a single boot sequence per identity:
 *     guest   → `initSeedDataIfEmpty()`
 *     google  → `hydrateLastPulled` → `loadCloudData` (probe + prompt + apply)
 *   Then in either branch: `invalidateLists()` + flip `loading` off.
 *
 * - `useBootstrapLoading()` — the selector for UI. Many screens want a
 *   "loading until first paint is real" gate; instead of re-running the
 *   effect per subscriber, the bootstrap status lives in a tiny Zustand
 *   store and every screen just reads it.
 *
 * Prompting for merge-vs-cloud is a React Alert, which is why this lives
 * alongside UI rather than inside `features/sync/first-login` (those are
 * pure SQLite + sync ops).
 */
import { useEffect } from 'react';
import { Alert } from 'react-native';
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
import { ApiError } from '@/lib/api/errors';
import { initSeedDataIfEmpty } from './db';
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

/** Read-only selector for the bootstrap loading flag. */
export function useBootstrapLoading(): boolean {
  return useBootstrapStore(s => s.loading);
}

/**
 * Probe → prompt (if conflict) → apply. Pure UI-level Alert plumbing; the
 * SQLite + sync mutations themselves live in `features/sync/first-login`.
 */
async function loadCloudData(params: {
  token: string;
  onTokenExpired: () => Promise<void>;
}): Promise<void> {
  const { token, onTokenExpired } = params;
  const { lastPulledAt } = useSyncStore.getState();

  try {
    if (lastPulledAt === 0) {
      const { state, cloudWordCount, localWordCount } = await probeFirstLoginState(token);
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
      // 'both-empty' | 'cloud-only' → plain pull below suffices.
    }

    await pullChanges();
    // If we marked dirty above, flush now instead of waiting for debounce.
    if (useSyncStore.getState().dirtyListIds.size > 0 ||
        useSyncStore.getState().dirtyWordIds.size > 0) {
      await flushPush();
    }
  } catch (e: any) {
    if (e instanceof ApiError && e.status === 401) {
      await onTokenExpired();
      return;
    }
    console.warn('Cloud data load failed:', e?.message ?? e);
  }
}

/**
 * Mount this hook once at the app root. Subsequent consumers should read
 * `useBootstrapLoading()` rather than calling the effect hook again.
 */
export function useVocabBootstrap(): void {
  const { authMode, user, token, handleTokenExpired } = useAuth();

  useEffect(() => {
    let cancelled = false;
    useBootstrapStore.getState().setLoading(true);

    const run = async () => {
      if (authMode === 'google' && user?.googleId && token) {
        await AsyncStorage.setItem(LAST_GOOGLE_ID_KEY, user.googleId);
        await useSyncStore.getState().hydrateLastPulled();
        await loadCloudData({ token, onTokenExpired: handleTokenExpired });
      } else {
        await AsyncStorage.removeItem(LAST_GOOGLE_ID_KEY);
        await initSeedDataIfEmpty();
      }
      await invalidateLists();
      if (!cancelled) useBootstrapStore.getState().setLoading(false);
    };

    run();
    return () => { cancelled = true; };
  }, [authMode, token, user?.googleId, handleTokenExpired]);
}
