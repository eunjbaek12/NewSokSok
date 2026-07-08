/**
 * Regression: "다른 기기에서 로그인하면 단어장은 있는데 단어가 없다".
 *
 * PostgREST는 응답을 서버 max-rows(기본 1000행)로 조용히 자른다. 예전 pull은
 * 페이지네이션 없이 `.gt(updated_at)` 한 방이라, 첫 로그인(lastPulledAt=0)에서
 * 단어가 캡을 넘으면 초과분이 유실됐고 — 워터마크는 배치의 max(updated_at)
 * (단어장 행 포함 ≈ 현재)로 점프해 유실분을 영구히 격리했다.
 *
 * 이 스위트가 고정하는 새 계약:
 *   1. pull은 (updated_at, id) 키셋 페이지네이션으로 전량 드레인한다.
 *   2. 빈 배치에서 워터마크는 유지된다 (Date.now() 점프 금지 — 클라이언트
 *      시계가 서버보다 빠르면 그 사이 서버 쓰기를 영구 스킵하는 구멍).
 *   3. push는 워터마크를 전진시키지 않는다 (다른 기기의 미pull 행 스킵 방지).
 *   4. pull은 dirty(미push 로컬 수정) 행을 덮어쓰지 않는다 — push가 워터마크를
 *      안 올리는 대신 자기 echo가 로컬 편집을 롤백하지 않게 하는 짝 가드.
 */

let mockRunCalls: { sql: string; params: any[] }[] = [];
let mockCloudLists: any[] = [];
let mockCloudWords: any[] = [];
let mockLocalDirtyWordRows: any[] = [];
let mockPageRequests = 0; // supabase 쿼리 실행 횟수(페이지 요청 수 검증용)
let mockUpsertCalls: { table: string; rows: any[] }[] = [];

jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));

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

jest.mock('@/features/auth', () => ({
  useAuthStore: { getState: () => ({ mode: 'google', user: { id: 'u1' } }) },
  isCloudAuthMode: (mode: string) => mode === 'google' || mode === 'apple',
}));

jest.mock('@/lib/supabase', () => {
  // 실제 PostgREST 의미론을 흉내내는 mock: gt/eq/in 필터, order 정렬, limit
  // 슬라이스, 키셋 or() 커서를 전부 실제로 적용한다. 페이지네이션이 진짜로
  // 여러 페이지를 요청하고 이어붙이는지 검증하려면 필터가 진짜여야 한다.
  const makeQuery = (rows: () => any[], table: string) => {
    const state: any = { filters: [] as ((r: any) => boolean)[], orders: [] as string[], limit: Infinity };
    const q: any = {
      select: () => q,
      gt: (f: string, v: any) => { state.filters.push((r: any) => r[f] > v); return q; },
      eq: (f: string, v: any) => { state.filters.push((r: any) => r[f] === v); return q; },
      in: (f: string, ids: any[]) => { state.filters.push((r: any) => ids.includes(r[f])); return q; },
      or: (expr: string) => {
        const m = expr.match(/^updated_at\.gt\.(\d+),and\(updated_at\.eq\.\1,id\.gt\.(.+)\)$/);
        if (!m) throw new Error('unexpected or() expr: ' + expr);
        const ts = Number(m[1]);
        const id = m[2];
        state.filters.push((r: any) => r.updated_at > ts || (r.updated_at === ts && r.id > id));
        return q;
      },
      order: (f: string) => { state.orders.push(f); return q; },
      limit: (n: number) => { state.limit = n; return q; },
      upsert: async (payload: any[]) => {
        mockUpsertCalls.push({ table, rows: payload });
        return { error: null };
      },
      then: (resolve: any, reject: any) => {
        mockPageRequests += 1;
        let data = rows().filter(r => state.filters.every((f: any) => f(r)));
        data = [...data].sort((a, b) => {
          for (const f of state.orders) {
            if (a[f] < b[f]) return -1;
            if (a[f] > b[f]) return 1;
          }
          return 0;
        });
        data = data.slice(0, state.limit);
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return q;
  };

  return {
    supabase: {
      from: (table: string) =>
        makeQuery(() => (table === 'cloud_lists' ? mockCloudLists : mockCloudWords), table),
    },
  };
});

jest.mock('expo-sqlite', () => {
  const { SCHEMA_VERSION } = require('@/lib/db/migrations');
  const conn: any = {
    execAsync: async () => {},
    runAsync: async (sql: string, ...params: any[]) => { mockRunCalls.push({ sql, params }); },
    getAllAsync: async (sql: string) => {
      if (sql.includes('SELECT * FROM words WHERE id IN')) return mockLocalDirtyWordRows;
      // validListIds 조회: pull이 방금 INSERT한 단어장이 보여야 단어가 orphan
      // 처리되지 않는다. mock DB는 실제 저장을 안 하므로 클라우드 목록으로 대신한다.
      if (sql.includes('deletedAt IS NULL') && sql.includes('FROM lists')) {
        return mockCloudLists.filter(l => !l.is_deleted).map(l => ({ id: l.id }));
      }
      // tombstone 조회 등은 빈 기기
      return [];
    },
    getFirstAsync: async (sql: string) =>
      sql.includes('user_version') ? { user_version: SCHEMA_VERSION } : null,
    withTransactionAsync: async (task: () => Promise<void>) => { await task(); },
    closeAsync: async () => {},
  };
  return { openDatabaseAsync: async () => conn };
});

import { pullChanges, flushPush, PULL_PAGE } from '@/features/sync/engine';
import { useSyncStore } from '@/features/sync/store';

const fullList = (over: Record<string, any>) => ({
  title: 't', is_visible: true, is_curated: false, icon: null, position: 0,
  plan_total_days: 0, plan_current_day: 1, plan_words_per_day: 10,
  plan_started_at: null, plan_updated_at: null, plan_filter: 'all',
  source_language: 'en', target_language: 'ko',
  last_result_memorized: 0, last_result_total: 0, last_result_percent: 0,
  last_studied_at: null, is_user_shared: false, creator_id: null,
  creator_name: null, download_count: 0, created_at: 1000, updated_at: 2000,
  is_deleted: false,
  ...over,
});
const fullWord = (over: Record<string, any>) => ({
  term: 'w', definition: '', phonetic: null, pos: null, example_en: '',
  example_kr: null, meaning_kr: 'm', is_memorized: false, is_starred: false,
  tags: null, position: 0, wrong_count: 0, assigned_day: null,
  source_lang: 'en', target_lang: 'ko', created_at: 1000, updated_at: 2000,
  is_deleted: false,
  ...over,
});

const insertedWordIds = () =>
  mockRunCalls.filter(c => c.sql.includes('INSERT OR REPLACE INTO words')).map(c => c.params[0][0]);

beforeEach(async () => {
  mockRunCalls = [];
  mockCloudLists = [];
  mockCloudWords = [];
  mockLocalDirtyWordRows = [];
  mockPageRequests = 0;
  mockUpsertCalls = [];
  await useSyncStore.getState().resetAll();
});

describe('pullChanges — 키셋 페이지네이션 전량 드레인', () => {
  it('PULL_PAGE를 넘는 단어를 여러 페이지로 나눠 전부 받아온다 (첫 로그인 재현)', async () => {
    const TOTAL = Math.floor(PULL_PAGE * 2.4); // 3페이지 분량
    mockCloudLists = [fullList({ id: 'L1', updated_at: 999_999 })];
    mockCloudWords = Array.from({ length: TOTAL }, (_, i) =>
      fullWord({
        id: `W${String(i).padStart(5, '0')}`, // 문자열 정렬 = 숫자 정렬이 되게 패딩
        list_id: 'L1',
        updated_at: 1000 + i,
      }),
    );

    await pullChanges();

    const ids = new Set(insertedWordIds());
    expect(ids.size).toBe(TOTAL); // 한 단어도 잘리지 않았다
    // 진짜 여러 페이지를 요청했는지 (gt 드레인 3 + by-list 드레인 3 + lists 1 ≥ 5)
    expect(mockPageRequests).toBeGreaterThanOrEqual(5);
    // 워터마크 = 배치 max(updated_at) — 전량 수신했으므로 안전하게 전진
    expect(useSyncStore.getState().lastPulledAt).toBe(999_999);
  });

  it('배치 내 updated_at 동률(배치 upsert 에코)은 id 타이브레이커로 빠짐없이 드레인한다', async () => {
    // 배치 upsert는 트리거가 statement 시각을 쓰므로 수백 행이 같은 updated_at을 가진다.
    const TOTAL = PULL_PAGE + 50;
    mockCloudLists = [fullList({ id: 'L1', updated_at: 8888 })];
    mockCloudWords = Array.from({ length: TOTAL }, (_, i) =>
      fullWord({ id: `W${String(i).padStart(5, '0')}`, list_id: 'L1', updated_at: 7777 }),
    );

    await pullChanges();

    expect(new Set(insertedWordIds()).size).toBe(TOTAL);
  });
});

describe('pullChanges — 워터마크 안전성', () => {
  it('빈 배치에서는 워터마크를 유지한다 (Date.now() 점프 금지)', async () => {
    await useSyncStore.getState().setLastPulledAt(42);
    await pullChanges();
    expect(useSyncStore.getState().lastPulledAt).toBe(42);
  });
});

describe('pullChanges — dirty-skip 가드 (echo가 로컬 편집을 롤백하지 않는다)', () => {
  it('dirty 단어는 pull이 덮어쓰지 않고, 나머지는 정상 적용한다', async () => {
    mockCloudLists = [fullList({ id: 'L1', updated_at: 3000 })];
    mockCloudWords = [
      fullWord({ id: 'W-dirty', list_id: 'L1', updated_at: 2500 }),
      fullWord({ id: 'W-clean', list_id: 'L1', updated_at: 2500 }),
    ];
    useSyncStore.getState().markWordDirty('W-dirty');

    await pullChanges();

    const ids = insertedWordIds();
    expect(ids).toContain('W-clean');
    expect(ids).not.toContain('W-dirty'); // 미push 로컬 수정 보존
  });
});

describe('flushPush — 워터마크 불변', () => {
  it('push는 업로드만 하고 lastPulledAt을 전진시키지 않는다', async () => {
    await useSyncStore.getState().setLastPulledAt(7);
    useSyncStore.getState().markWordDirty('W1');
    mockLocalDirtyWordRows = [{
      id: 'W1', listId: 'L1', term: 't', definition: '', meaningKr: 'm',
      exampleEn: '', position: 0, deletedAt: null,
    }];

    await flushPush();

    expect(mockUpsertCalls.map(c => c.table)).toContain('cloud_words');
    expect(useSyncStore.getState().lastPulledAt).toBe(7); // 예전 echo-prevention 점프 제거
    expect(useSyncStore.getState().dirtyWordIds.size).toBe(0);
  });
});
