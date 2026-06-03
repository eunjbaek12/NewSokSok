/**
 * Fix 2: the sync dirty set must survive a reload/crash so a pending (un-pushed)
 * delete/edit still reaches the cloud — it used to live only in memory, so the
 * push-debounce window was a data-loss window. Verifies mark/clear persist to
 * AsyncStorage, hydrateDirty restores, and resetAll wipes the backup.
 */
jest.mock('@react-native-async-storage/async-storage', () => {
  const mem = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: async (k: string) => (mem.has(k) ? mem.get(k)! : null),
      setItem: async (k: string, v: string) => { mem.set(k, v); },
      removeItem: async (k: string) => { mem.delete(k); },
    },
  };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncStore } from '@/features/sync/store';

const DIRTY_LISTS_KEY = '@soksok_dirty_lists';
const DIRTY_WORDS_KEY = '@soksok_dirty_words';

const readSet = async (key: string): Promise<string[]> => {
  const raw = await AsyncStorage.getItem(key);
  return raw ? JSON.parse(raw) : [];
};

describe('sync store — dirty set persistence', () => {
  beforeEach(async () => {
    await useSyncStore.getState().resetAll();
  });

  it('persists marked ids to AsyncStorage', async () => {
    useSyncStore.getState().markListsDirty(['l1', 'l2']);
    useSyncStore.getState().markWordsDirty(['w1']);

    expect((await readSet(DIRTY_LISTS_KEY)).sort()).toEqual(['l1', 'l2']);
    expect(await readSet(DIRTY_WORDS_KEY)).toEqual(['w1']);
  });

  it('hydrateDirty restores ids after a simulated reload', async () => {
    // Seed storage, then blow away the in-memory sets like a fresh app launch.
    await AsyncStorage.setItem(DIRTY_LISTS_KEY, JSON.stringify(['lx']));
    await AsyncStorage.setItem(DIRTY_WORDS_KEY, JSON.stringify(['wx', 'wy']));
    useSyncStore.setState({ dirtyListIds: new Set(), dirtyWordIds: new Set() });

    await useSyncStore.getState().hydrateDirty();

    expect([...useSyncStore.getState().dirtyListIds]).toEqual(['lx']);
    expect([...useSyncStore.getState().dirtyWordIds].sort()).toEqual(['wx', 'wy']);
  });

  it('clearing dirty ids updates the persisted backup', async () => {
    useSyncStore.getState().markListsDirty(['a', 'b', 'c']);
    useSyncStore.getState().clearDirtyLists(['b']);
    expect((await readSet(DIRTY_LISTS_KEY)).sort()).toEqual(['a', 'c']);
  });

  it('resetAll wipes the persisted backup', async () => {
    useSyncStore.getState().markListsDirty(['a']);
    useSyncStore.getState().markWordsDirty(['w']);
    await useSyncStore.getState().resetAll();
    expect(await AsyncStorage.getItem(DIRTY_LISTS_KEY)).toBeNull();
    expect(await AsyncStorage.getItem(DIRTY_WORDS_KEY)).toBeNull();
  });
});
