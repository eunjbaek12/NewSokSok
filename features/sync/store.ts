import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_PULLED_AT_KEY = '@soksok_last_pulled_at';
const DIRTY_LISTS_KEY = '@soksok_dirty_lists';
const DIRTY_WORDS_KEY = '@soksok_dirty_words';

/**
 * Durably back up a dirty set to AsyncStorage. The dirty set is the record of
 * "local changes not yet pushed to the cloud". It used to live only in memory,
 * so any reload/crash/kill inside the push-debounce window (DEBOUNCE_MS=30s)
 * dropped pending changes — most painfully soft-deletes, which then got
 * resurrected on the next pull from the still-alive cloud copy. Persisting at
 * mark/clear time (not push time) is what lets a pending delete survive a crash
 * and still reach the cloud. Fire-and-forget: a failed write only loses
 * durability for that one change, never blocks the mutation.
 */
function persistSet(key: string, set: Set<string>): void {
  AsyncStorage.setItem(key, JSON.stringify([...set])).catch(() => {});
}

function parseStoredIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

interface SyncStoreState {
  dirtyListIds: Set<string>;
  dirtyWordIds: Set<string>;
  lastPulledAt: number;
  isSyncing: boolean;

  markListDirty: (id: string) => void;
  markWordDirty: (id: string) => void;
  markListsDirty: (ids: string[]) => void;
  markWordsDirty: (ids: string[]) => void;

  clearDirtyLists: (ids?: string[]) => void;
  clearDirtyWords: (ids?: string[]) => void;

  hydrateLastPulled: () => Promise<void>;
  hydrateDirty: () => Promise<void>;
  setLastPulledAt: (t: number) => Promise<void>;
  setIsSyncing: (b: boolean) => void;
  resetAll: () => Promise<void>;
}

export const useSyncStore = create<SyncStoreState>((set, get) => ({
  dirtyListIds: new Set(),
  dirtyWordIds: new Set(),
  lastPulledAt: 0,
  isSyncing: false,

  markListDirty: (id) => {
    const next = new Set(get().dirtyListIds);
    next.add(id);
    set({ dirtyListIds: next });
    persistSet(DIRTY_LISTS_KEY, next);
  },
  markWordDirty: (id) => {
    const next = new Set(get().dirtyWordIds);
    next.add(id);
    set({ dirtyWordIds: next });
    persistSet(DIRTY_WORDS_KEY, next);
  },
  markListsDirty: (ids) => {
    const next = new Set(get().dirtyListIds);
    for (const id of ids) next.add(id);
    set({ dirtyListIds: next });
    persistSet(DIRTY_LISTS_KEY, next);
  },
  markWordsDirty: (ids) => {
    const next = new Set(get().dirtyWordIds);
    for (const id of ids) next.add(id);
    set({ dirtyWordIds: next });
    persistSet(DIRTY_WORDS_KEY, next);
  },

  clearDirtyLists: (ids) => {
    if (!ids) {
      set({ dirtyListIds: new Set() });
      persistSet(DIRTY_LISTS_KEY, new Set());
      return;
    }
    const next = new Set(get().dirtyListIds);
    for (const id of ids) next.delete(id);
    set({ dirtyListIds: next });
    persistSet(DIRTY_LISTS_KEY, next);
  },
  clearDirtyWords: (ids) => {
    if (!ids) {
      set({ dirtyWordIds: new Set() });
      persistSet(DIRTY_WORDS_KEY, new Set());
      return;
    }
    const next = new Set(get().dirtyWordIds);
    for (const id of ids) next.delete(id);
    set({ dirtyWordIds: next });
    persistSet(DIRTY_WORDS_KEY, next);
  },

  hydrateLastPulled: async () => {
    try {
      const raw = await AsyncStorage.getItem(LAST_PULLED_AT_KEY);
      const n = raw ? Number(raw) : 0;
      set({ lastPulledAt: Number.isFinite(n) && n >= 0 ? n : 0 });
    } catch {
      set({ lastPulledAt: 0 });
    }
  },

  hydrateDirty: async () => {
    try {
      const [rawLists, rawWords] = await Promise.all([
        AsyncStorage.getItem(DIRTY_LISTS_KEY),
        AsyncStorage.getItem(DIRTY_WORDS_KEY),
      ]);
      // Union with any ids already marked this session so a hydrate that races
      // an early mutation can't drop it.
      const lists = new Set(get().dirtyListIds);
      for (const id of parseStoredIds(rawLists)) lists.add(id);
      const words = new Set(get().dirtyWordIds);
      for (const id of parseStoredIds(rawWords)) words.add(id);
      set({ dirtyListIds: lists, dirtyWordIds: words });
    } catch {
      // Leave the in-memory sets as-is on read/parse failure.
    }
  },

  setLastPulledAt: async (t) => {
    set({ lastPulledAt: t });
    try { await AsyncStorage.setItem(LAST_PULLED_AT_KEY, String(t)); } catch {}
  },

  setIsSyncing: (b) => set({ isSyncing: b }),

  resetAll: async () => {
    set({ dirtyListIds: new Set(), dirtyWordIds: new Set(), lastPulledAt: 0, isSyncing: false });
    try {
      await Promise.all([
        AsyncStorage.removeItem(LAST_PULLED_AT_KEY),
        AsyncStorage.removeItem(DIRTY_LISTS_KEY),
        AsyncStorage.removeItem(DIRTY_WORDS_KEY),
      ]);
    } catch {}
  },
}));
