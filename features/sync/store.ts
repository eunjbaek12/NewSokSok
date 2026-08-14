import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_PULLED_AT_KEY = '@soksok_last_pulled_at';
const DIRTY_LISTS_KEY = '@soksok_dirty_lists';
const DIRTY_WORDS_KEY = '@soksok_dirty_words';
const DIRTY_STAT_DATES_KEY = '@soksok_dirty_stat_dates';

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
  /** 아직 push되지 않은 study_days/memorized_log 변경이 있는 날짜('YYYY-MM-DD'). */
  dirtyStatDates: Set<string>;
  lastPulledAt: number;
  isSyncing: boolean;

  markListDirty: (id: string) => void;
  markWordDirty: (id: string) => void;
  markListsDirty: (ids: string[]) => void;
  markWordsDirty: (ids: string[]) => void;
  /**
   * hydrate 이전에도 안전한 마킹. 저장된 값을 읽어 **합집합**으로 다시 쓴다.
   *
   * 평소 경로(`markWordsDirty`)는 메모리 Set을 정본으로 보고 AsyncStorage를 통째로
   * 덮어쓴다 — hydrate가 끝난 뒤라면 맞다. 하지만 DB 마이그레이션처럼 `hydrateDirty()`
   * 보다 먼저 도는 코드에서 부르면 메모리가 빈 Set이라, **아직 읽지 않은 기존 dirty를
   * 지워 버린다**(오프라인에서 고친 단어가 서버에 영영 못 올라간다).
   */
  markWordsDirtyDurable: (ids: string[]) => Promise<void>;
  markStatDatesDirty: (dates: string[]) => void;

  clearDirtyLists: (ids?: string[]) => void;
  clearDirtyWords: (ids?: string[]) => void;
  clearDirtyStatDates: (dates?: string[]) => void;

  hydrateLastPulled: () => Promise<void>;
  hydrateDirty: () => Promise<void>;
  setLastPulledAt: (t: number) => Promise<void>;
  setIsSyncing: (b: boolean) => void;
  resetAll: () => Promise<void>;
}

export const useSyncStore = create<SyncStoreState>((set, get) => ({
  dirtyListIds: new Set(),
  dirtyWordIds: new Set(),
  dirtyStatDates: new Set(),
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
  markWordsDirtyDurable: async (ids) => {
    // 저장값 ∪ 메모리 ∪ 새 id. 읽기에 실패하면 저장된 것을 모르는 상태이므로 덮어쓰지
    // 않고 메모리에만 반영한다 — 나중 hydrate가 저장값과 합쳐 주므로 잃지 않는다.
    let stored: string[];
    try {
      stored = parseStoredIds(await AsyncStorage.getItem(DIRTY_WORDS_KEY));
    } catch {
      const memoryOnly = new Set(get().dirtyWordIds);
      for (const id of ids) memoryOnly.add(id);
      set({ dirtyWordIds: memoryOnly });
      return;
    }
    const next = new Set(stored);
    for (const id of get().dirtyWordIds) next.add(id);
    for (const id of ids) next.add(id);
    set({ dirtyWordIds: next });
    try {
      await AsyncStorage.setItem(DIRTY_WORDS_KEY, JSON.stringify([...next]));
    } catch {
      // 메모리에는 남아 있으므로 이번 실행의 push는 정상. 다음 실행에서 다시 마킹된다.
    }
  },
  markStatDatesDirty: (dates) => {
    const next = new Set(get().dirtyStatDates);
    for (const d of dates) next.add(d);
    set({ dirtyStatDates: next });
    persistSet(DIRTY_STAT_DATES_KEY, next);
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
  clearDirtyStatDates: (dates) => {
    if (!dates) {
      set({ dirtyStatDates: new Set() });
      persistSet(DIRTY_STAT_DATES_KEY, new Set());
      return;
    }
    const next = new Set(get().dirtyStatDates);
    for (const d of dates) next.delete(d);
    set({ dirtyStatDates: next });
    persistSet(DIRTY_STAT_DATES_KEY, next);
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
      const [rawLists, rawWords, rawStatDates] = await Promise.all([
        AsyncStorage.getItem(DIRTY_LISTS_KEY),
        AsyncStorage.getItem(DIRTY_WORDS_KEY),
        AsyncStorage.getItem(DIRTY_STAT_DATES_KEY),
      ]);
      // Union with any ids already marked this session so a hydrate that races
      // an early mutation can't drop it.
      const lists = new Set(get().dirtyListIds);
      for (const id of parseStoredIds(rawLists)) lists.add(id);
      const words = new Set(get().dirtyWordIds);
      for (const id of parseStoredIds(rawWords)) words.add(id);
      const statDates = new Set(get().dirtyStatDates);
      for (const d of parseStoredIds(rawStatDates)) statDates.add(d);
      set({ dirtyListIds: lists, dirtyWordIds: words, dirtyStatDates: statDates });
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
    set({ dirtyListIds: new Set(), dirtyWordIds: new Set(), dirtyStatDates: new Set(), lastPulledAt: 0, isSyncing: false });
    try {
      await Promise.all([
        AsyncStorage.removeItem(LAST_PULLED_AT_KEY),
        AsyncStorage.removeItem(DIRTY_LISTS_KEY),
        AsyncStorage.removeItem(DIRTY_WORDS_KEY),
        AsyncStorage.removeItem(DIRTY_STAT_DATES_KEY),
      ]);
    } catch {}
  },
}));
