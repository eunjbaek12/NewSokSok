/**
 * 골라서 학습 화면의 상태. 수명이 다른 두 덩어리가 한 파일에 있다.
 *
 * - 필터: 비영속. 앱을 켜면 기본값에서 시작하고, 실행 중에는 화면을 닫았다
 *   다시 열어도 남는다. 필터 기억은 "방금 뭘 했는지" 문맥이 살아 있을 때만
 *   도움이 되기 때문이다.
 * - 지난번 조건: 영속. 저장은 하되 자동으로 걸지 않는다 — 사용자가 눌러야
 *   적용된다. 나도 모르게 걸려 있는 것과 내가 눌러서 건 것의 차이다.
 */
import { create } from 'zustand';
import { RecentPicksSchema, type PickFilters, type RecentPick } from '@shared/contracts';
import { persisted } from '@/lib/storage/persisted';
import { DEFAULT_PICK_FILTERS, pickFiltersKey } from './filter';

const recentEntry = persisted('@soksok_pick_recent', RecentPicksSchema, [] as RecentPick[]);

/** 빈 화면에 세 줄까지. 목록이 있을 때는 맨 위 하나만 얹는다. */
export const RECENT_LIMIT = 3;

interface PickState {
  filters: PickFilters;
  recents: RecentPick[];
  hydrated: boolean;

  setFilters: (patch: Partial<PickFilters>) => void;
  applyFilters: (filters: PickFilters) => void;
  resetFilters: () => void;

  hydrateRecents: () => Promise<void>;
  rememberCondition: (filters: PickFilters, count: number) => void;
  dropRecent: (savedAt: number) => void;
}

export const usePickStore = create<PickState>((set, get) => ({
  filters: DEFAULT_PICK_FILTERS,
  recents: [],
  hydrated: false,

  setFilters: (patch) => set(s => ({ filters: { ...s.filters, ...patch } })),
  applyFilters: (filters) => set({ filters }),
  resetFilters: () => set({ filters: DEFAULT_PICK_FILTERS }),

  hydrateRecents: async () => {
    if (get().hydrated) return;
    const recents = await recentEntry.load();
    set({ recents, hydrated: true });
  },

  rememberCondition: (filters, count) => {
    const key = pickFiltersKey(filters);
    const entry: RecentPick = { savedAt: Date.now(), count, filters };
    // 같은 조합은 새로 쌓지 않고 맨 위로 올린다.
    const rest = get().recents.filter(r => pickFiltersKey(r.filters) !== key);
    const recents = [entry, ...rest].slice(0, RECENT_LIMIT);
    set({ recents });
    // 저장 실패는 조용히 넘긴다 — 편의 기능이라 학습 시작을 막을 이유가 없다.
    recentEntry.save(recents).catch(() => {});
  },

  dropRecent: (savedAt) => {
    const recents = get().recents.filter(r => r.savedAt !== savedAt);
    set({ recents });
    recentEntry.save(recents).catch(() => {});
  },
}));

/** 테스트·계정 전환용. 화면에서는 쓰지 않는다. */
export const pickRecentStorage = recentEntry;
