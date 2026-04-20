import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_PULLED_AT_KEY = '@soksok_last_pulled_at';

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
  },
  markWordDirty: (id) => {
    const next = new Set(get().dirtyWordIds);
    next.add(id);
    set({ dirtyWordIds: next });
  },
  markListsDirty: (ids) => {
    const next = new Set(get().dirtyListIds);
    for (const id of ids) next.add(id);
    set({ dirtyListIds: next });
  },
  markWordsDirty: (ids) => {
    const next = new Set(get().dirtyWordIds);
    for (const id of ids) next.add(id);
    set({ dirtyWordIds: next });
  },

  clearDirtyLists: (ids) => {
    if (!ids) {
      set({ dirtyListIds: new Set() });
      return;
    }
    const next = new Set(get().dirtyListIds);
    for (const id of ids) next.delete(id);
    set({ dirtyListIds: next });
  },
  clearDirtyWords: (ids) => {
    if (!ids) {
      set({ dirtyWordIds: new Set() });
      return;
    }
    const next = new Set(get().dirtyWordIds);
    for (const id of ids) next.delete(id);
    set({ dirtyWordIds: next });
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

  setLastPulledAt: async (t) => {
    set({ lastPulledAt: t });
    try { await AsyncStorage.setItem(LAST_PULLED_AT_KEY, String(t)); } catch {}
  },

  setIsSyncing: (b) => set({ isSyncing: b }),

  resetAll: async () => {
    set({ dirtyListIds: new Set(), dirtyWordIds: new Set(), lastPulledAt: 0, isSyncing: false });
    try { await AsyncStorage.removeItem(LAST_PULLED_AT_KEY); } catch {}
  },
}));
