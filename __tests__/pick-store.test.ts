/**
 * 골라서 학습의 상태 수명 시나리오.
 *
 * 이 화면은 "무엇이 남고 무엇이 사라지는가"가 곧 기능이다 — 필터는 앱을 켜면
 * 사라져야 하고, 지난번 조건은 남되 자동으로 걸리면 안 되며, 계정이 바뀌면
 * 둘 다 없어져야 한다. 셋 중 하나만 어긋나도 사용자는 "왜 이것만 나오지"를
 * 겪는다. 렌더 없이 스토어만 돌려서 그 경계를 고정한다.
 */

jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: (k: string) => Promise.resolve(store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => { store.set(k, v); return Promise.resolve(); },
      removeItem: (k: string) => { store.delete(k); return Promise.resolve(); },
      __reset: () => store.clear(),
      __setRaw: (k: string, v: string) => store.set(k, v),
      __getRaw: (k: string) => (store.has(k) ? store.get(k)! : null),
    },
  };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import { RecentPicksSchema, type PickFilters } from '@shared/contracts';
import { persisted } from '@/lib/storage/persisted';
import { usePickStore } from '@/features/study/pick/store';
import { DEFAULT_PICK_FILTERS } from '@/features/study/pick/filter';

const Mock = AsyncStorage as unknown as {
  __reset: () => void;
  __setRaw: (k: string, v: string) => void;
  __getRaw: (k: string) => string | null;
};

const RECENT_KEY = '@soksok_pick_recent';

const filters = (over: Partial<PickFilters> = {}): PickFilters => ({ ...DEFAULT_PICK_FILTERS, ...over });

const reset = () => {
  Mock.__reset();
  usePickStore.setState({ filters: DEFAULT_PICK_FILTERS, recents: [], hydrated: false });
};

beforeEach(reset);

// ─── 필터 수명 ────────────────────────────────────────────────────────────────

describe('필터는 실행 중에만 산다', () => {
  test('기본값에서 시작한다', () => {
    expect(usePickStore.getState().filters).toEqual(DEFAULT_PICK_FILTERS);
  });

  test('부분 갱신은 나머지를 건드리지 않는다', () => {
    usePickStore.getState().setFilters({ wordFilter: 'learning' });
    usePickStore.getState().setFilters({ starredOnly: true });
    expect(usePickStore.getState().filters).toEqual(filters({ wordFilter: 'learning', starredOnly: true }));
  });

  test('필터는 디스크에 쓰이지 않는다 — 앱을 껐다 켜면 사라져야 하므로', async () => {
    usePickStore.getState().setFilters({ wordFilter: 'memorized', posFilter: 'verb' });
    await Promise.resolve();
    expect(Mock.__getRaw(RECENT_KEY)).toBeNull();
  });

  test('초기화는 다섯 가지를 한 번에 되돌린다', () => {
    usePickStore.getState().setFilters({
      wordFilter: 'learning', starredOnly: true, posFilter: 'noun', tag: '여행',
      useAllLists: false, selectedListIds: ['a'],
    });
    usePickStore.getState().resetFilters();
    expect(usePickStore.getState().filters).toEqual(DEFAULT_PICK_FILTERS);
  });
});

// ─── 지난번 조건 ──────────────────────────────────────────────────────────────

describe('지난번 조건', () => {
  test('학습을 시작해야 저장된다 — 칩을 눌러도 쌓이지 않는다', async () => {
    usePickStore.getState().setFilters({ wordFilter: 'learning' });
    usePickStore.getState().setFilters({ posFilter: 'verb' });
    expect(usePickStore.getState().recents).toHaveLength(0);

    usePickStore.getState().rememberCondition(usePickStore.getState().filters, 42);
    expect(usePickStore.getState().recents).toHaveLength(1);
    expect(usePickStore.getState().recents[0].count).toBe(42);
  });

  test('최근 3개까지만 남고 최신이 맨 위', async () => {
    const s = usePickStore.getState();
    s.rememberCondition(filters({ wordFilter: 'all' }), 1);
    s.rememberCondition(filters({ wordFilter: 'learning' }), 2);
    s.rememberCondition(filters({ wordFilter: 'memorized' }), 3);
    s.rememberCondition(filters({ wordFilter: 'wrongCount' }), 4);

    const recents = usePickStore.getState().recents;
    expect(recents).toHaveLength(3);
    expect(recents.map(r => r.filters.wordFilter)).toEqual(['wrongCount', 'memorized', 'learning']);
  });

  test('같은 조합을 다시 쓰면 새로 쌓지 않고 맨 위로 올린다', () => {
    const s = usePickStore.getState();
    s.rememberCondition(filters({ wordFilter: 'learning' }), 10);
    s.rememberCondition(filters({ wordFilter: 'memorized' }), 20);
    s.rememberCondition(filters({ wordFilter: 'learning' }), 11);

    const recents = usePickStore.getState().recents;
    expect(recents).toHaveLength(2);
    expect(recents[0].filters.wordFilter).toBe('learning');
    expect(recents[0].count).toBe(11);
  });

  test('표현만 다르고 결과가 같은 조합도 한 줄로 본다', () => {
    const s = usePickStore.getState();
    s.rememberCondition(filters({ useAllLists: false, selectedListIds: ['a', 'b'] }), 5);
    s.rememberCondition(filters({ useAllLists: false, selectedListIds: ['b', 'a'] }), 5);
    expect(usePickStore.getState().recents).toHaveLength(1);
  });

  test('저장한 조건은 디스크에 남는다', async () => {
    usePickStore.getState().rememberCondition(filters({ wordFilter: 'learning' }), 7);
    await new Promise(r => setImmediate(r));

    const raw = Mock.__getRaw(RECENT_KEY);
    expect(raw).not.toBeNull();
    const parsed = RecentPicksSchema.safeParse(JSON.parse(raw!));
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data[0].filters.wordFilter).toBe('learning');
  });

  test('앱을 다시 켜면 조건은 읽어오지만 필터는 기본값이다', async () => {
    usePickStore.getState().rememberCondition(filters({ wordFilter: 'learning', starredOnly: true }), 9);
    await new Promise(r => setImmediate(r));

    // 새 실행 — 메모리 상태만 날아간 상황
    usePickStore.setState({ filters: DEFAULT_PICK_FILTERS, recents: [], hydrated: false });
    await usePickStore.getState().hydrateRecents();

    expect(usePickStore.getState().recents).toHaveLength(1);
    // 자동으로 걸리지 않는다 — 눌러야 적용된다.
    expect(usePickStore.getState().filters).toEqual(DEFAULT_PICK_FILTERS);
  });

  test('이미 읽었으면 다시 읽지 않는다', async () => {
    await usePickStore.getState().hydrateRecents();
    usePickStore.getState().rememberCondition(filters({ wordFilter: 'learning' }), 3);
    await usePickStore.getState().hydrateRecents();
    expect(usePickStore.getState().recents).toHaveLength(1);
  });

  test('눌러서 적용하면 그 조합이 통째로 걸린다', () => {
    const saved = filters({ wordFilter: 'wrongCount', posFilter: 'verb', useAllLists: false, selectedListIds: ['a'] });
    usePickStore.getState().applyFilters(saved);
    expect(usePickStore.getState().filters).toEqual(saved);
  });

  test('저장값이 깨져 있으면 조용히 빈 목록', async () => {
    Mock.__setRaw(RECENT_KEY, '{ not json');
    await usePickStore.getState().hydrateRecents();
    expect(usePickStore.getState().recents).toEqual([]);
  });

  test('스키마에 맞지 않는 저장값도 빈 목록 — 화면이 깨지지 않는다', async () => {
    Mock.__setRaw(RECENT_KEY, JSON.stringify([{ savedAt: 'yesterday', count: -1 }]));
    await usePickStore.getState().hydrateRecents();
    expect(usePickStore.getState().recents).toEqual([]);
  });

  test('한 줄만 지울 수 있다', async () => {
    const s = usePickStore.getState();
    s.rememberCondition(filters({ wordFilter: 'learning' }), 1);
    s.rememberCondition(filters({ wordFilter: 'memorized' }), 2);
    const target = usePickStore.getState().recents[0].savedAt;

    usePickStore.getState().dropRecent(target);
    expect(usePickStore.getState().recents).toHaveLength(1);
    expect(usePickStore.getState().recents[0].filters.wordFilter).toBe('learning');
  });

  test('연달아 저장해도 줄마다 신원이 다르다 — 목록 key이자 삭제 대상이라', () => {
    const s = usePickStore.getState();
    s.rememberCondition(filters({ wordFilter: 'learning' }), 1);
    s.rememberCondition(filters({ wordFilter: 'memorized' }), 2);
    s.rememberCondition(filters({ wordFilter: 'wrongCount' }), 3);

    const stamps = usePickStore.getState().recents.map(r => r.savedAt);
    expect(new Set(stamps).size).toBe(3);
    // 최신이 맨 위 — 시간 순서도 유지된다.
    expect(stamps[0]).toBeGreaterThan(stamps[1]);
    expect(stamps[1]).toBeGreaterThan(stamps[2]);
  });
});

// ─── 계정 전환 ────────────────────────────────────────────────────────────────

describe('계정이 바뀌면', () => {
  test('필터와 조건이 함께 사라진다 — 단어장 id가 이전 계정의 것이므로', async () => {
    const s = usePickStore.getState();
    s.setFilters({ useAllLists: false, selectedListIds: ['a-of-account-A'] });
    s.rememberCondition(filters({ useAllLists: false, selectedListIds: ['a-of-account-A'] }), 12);
    await new Promise(r => setImmediate(r));
    expect(Mock.__getRaw(RECENT_KEY)).not.toBeNull();

    await usePickStore.getState().clearAll();

    expect(usePickStore.getState().filters).toEqual(DEFAULT_PICK_FILTERS);
    expect(usePickStore.getState().recents).toEqual([]);
    expect(Mock.__getRaw(RECENT_KEY)).toBeNull();
  });

  test('비운 뒤에는 다시 읽어도 비어 있다', async () => {
    usePickStore.getState().rememberCondition(filters(), 1);
    await usePickStore.getState().clearAll();
    await usePickStore.getState().hydrateRecents();
    expect(usePickStore.getState().recents).toEqual([]);
  });
});
