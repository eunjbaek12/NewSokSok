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
  }
}

export function useVocabBootstrap(): void {
  const { authMode, user } = useAuth();

  useEffect(() => {
    let cancelled = false;
    useBootstrapStore.getState().setLoading(true);

    const run = async () => {
      if (authMode === 'google' && user?.id) {
        await AsyncStorage.setItem(LAST_GOOGLE_ID_KEY, user.id);
        await useSyncStore.getState().hydrateLastPulled();
        await loadCloudData();
      } else {
        await AsyncStorage.removeItem(LAST_GOOGLE_ID_KEY);
        await initSeedDataIfEmpty();
      }
      await invalidateLists();
      if (!cancelled) useBootstrapStore.getState().setLoading(false);
    };

    run();
    return () => { cancelled = true; };
  }, [authMode, user?.id]);
}
