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
let mockInListIdQueries = 0; // by-list 완전성 조회 횟수
let mockUpsertCalls: { table: string; rows: any[] }[] = [];
/** 설정하면 그 테이블의 upsert가 실패한다(끊긴 push 재현용). */
let mockUpsertFailsFor: string | null = null;
/** 설정하면 upsert가 이 promise가 풀릴 때까지 멈춘다(push in-flight 재현용). */
let mockUpsertGate: Promise<void> | null = null;

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
      in: (f: string, ids: any[]) => {
        // by-list 완전성 조회만이 list_id로 .in()을 건다 — 그 조회가 실제로
        // 일어났는지 세는 신호로 쓴다.
        if (f === 'list_id') mockInListIdQueries += 1;
        state.filters.push((r: any) => ids.includes(r[f]));
        return q;
      },
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
        const gate = mockUpsertGate;
        if (gate) await gate;
        if (mockUpsertFailsFor === table) return { error: { message: 'network cut' } };
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

import { readFileSync } from 'fs';
import { join } from 'path';
import { pullChanges, flushPush, schedulePush, PULL_PAGE, WORD_COLUMN_COUNT, WORD_INSERT_CHUNK } from '@/features/sync/engine';
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

/**
 * 단어 INSERT는 여러 행을 한 문장에 싣는다(브리지 왕복 절감). 그래서 params[0]은
 * 행들이 이어붙은 평탄 배열이다 — WORD_COLUMN_COUNT 간격으로 끊어 각 행의 첫
 * 컬럼(id)을 뽑는다. 간격이 틀어지면 엉뚱한 값을 id로 읽으므로, 아래 "배치 INSERT
 * 계약" 스위트가 이 상수와 실제 SQL의 일치를 따로 강제한다.
 */
const insertedWordIds = () =>
  mockRunCalls
    .filter(c => c.sql.includes('INSERT OR REPLACE INTO words'))
    .flatMap(c => {
      const flat = c.params[0] as any[];
      const ids: any[] = [];
      for (let i = 0; i < flat.length; i += WORD_COLUMN_COUNT) ids.push(flat[i]);
      return ids;
    });

beforeEach(async () => {
  mockRunCalls = [];
  mockCloudLists = [];
  mockCloudWords = [];
  mockLocalDirtyWordRows = [];
  mockPageRequests = 0;
  mockInListIdQueries = 0;
  mockUpsertCalls = [];
  mockUpsertFailsFor = null;
  mockUpsertGate = null;
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
    // 진짜 여러 페이지를 요청했는지 (단어 gt 드레인만 3페이지 + 나머지 테이블)
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

/**
 * by-list 완전성 조회는 "리스트는 워터마크를 통과했는데 그 단어들은 통과하지 못해
 * 영원히 갇히는" 비대칭을 메우는 보정이다. 그 비대칭은 워터마크가 0보다 클 때만
 * 성립한다 — since=0이면 gt(0)이 모든 행을 통과시키므로 갇힐 행 자체가 없다.
 *
 * 실측(첫 로그인, 단어 5,605개)에서 이 조회가 2,836행을 다시 받아 전부 중복 제거에서
 * 버렸다. 2.3초와 그만큼의 트래픽이 순손실이라 첫 동기화에서는 건너뛴다. 이 스위트는
 * 그 생략이 첫 동기화에**만** 적용되는지를 양쪽으로 고정한다.
 */
describe('pullChanges — by-list 완전성 조회의 경계', () => {
  const seed = () => {
    mockCloudLists = [fullList({ id: 'L1', updated_at: 3000 })];
    mockCloudWords = [fullWord({ id: 'W1', list_id: 'L1', updated_at: 2500 })];
  };

  it('첫 동기화(lastPulledAt=0)에는 건너뛴다 — gt(0)이 이미 전량을 통과시킨다', async () => {
    seed();
    await pullChanges();
    expect(mockInListIdQueries).toBe(0);
    expect(insertedWordIds()).toContain('W1'); // 그래도 단어는 정상 수신
  });

  it('증분 동기화(lastPulledAt>0)에서는 여전히 수행한다 — 갇힌 단어를 구제해야 한다', async () => {
    await useSyncStore.getState().setLastPulledAt(1000);
    seed();
    await pullChanges();
    expect(mockInListIdQueries).toBeGreaterThan(0);
  });
});

/**
 * 단어 쓰기를 행 단위 runAsync에서 다중 VALUES 배치로 바꾼 뒤의 계약.
 * 상수와 실제 SQL이 어긋나면 문장이 통째로 실패하거나(파라미터 수 불일치)
 * 테스트 헬퍼가 엉뚱한 값을 id로 읽는다.
 */
describe('pullChanges — 배치 INSERT 계약', () => {
  const engineSrc = readFileSync(join(__dirname, '..', 'features/sync/engine.ts'), 'utf8');

  it('WORD_COLUMN_COUNT가 실제 INSERT 컬럼 수와 일치한다', () => {
    const m = engineSrc.match(/INSERT OR REPLACE INTO words\s*\(([^)]*)\)/);
    expect(m).not.toBeNull();
    const cols = m![1].split(',').map(c => c.trim()).filter(Boolean);
    expect(cols).toHaveLength(WORD_COLUMN_COUNT);
  });

  it('한 문장의 파라미터 수가 SQLite 한도(보수적 999)를 넘지 않는다', () => {
    expect(WORD_COLUMN_COUNT * WORD_INSERT_CHUNK).toBeLessThanOrEqual(999);
  });

  it('행 수보다 훨씬 적은 문장으로 쓴다 (왕복 절감이 실제로 일어난다)', async () => {
    const TOTAL = 300;
    mockCloudLists = [fullList({ id: 'L1', updated_at: 9999 })];
    mockCloudWords = Array.from({ length: TOTAL }, (_, i) =>
      fullWord({ id: `W${String(i).padStart(5, '0')}`, list_id: 'L1', updated_at: 1000 + i }),
    );

    await pullChanges();

    const statements = mockRunCalls.filter(c => c.sql.includes('INSERT OR REPLACE INTO words')).length;
    expect(new Set(insertedWordIds()).size).toBe(TOTAL); // 손실 없이
    expect(statements).toBe(Math.ceil(TOTAL / WORD_INSERT_CHUNK)); // 왕복은 1/40로
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

/**
 * Regression: "저장했는데 서버에 없다" — 그런데 **유실이 아니라 무기한 지연**이었다.
 *
 * push가 실패하면 dirty는 남으니 데이터는 안 사라진다. 문제는 **다시 시도할 계기가
 * 없었다**는 것이다: `flushPush`는 catch 없이 finally만 있어 재예약을 하지 않았고,
 * `pushInFlight` 스킵도 그냥 return이었다. 2026-09-01에 저장한 단어는 앱을 다시 켜서야
 * (부트스트랩 push) 2시간 44분 만에 올라갔다. 그 사이에 앱을 지웠으면 로컬 SQLite와 함께
 * dirty도 사라져 영구 유실이다.
 */
describe('flushPush — 실패하면 스스로 다시 시도한다', () => {
  const markOneDirtyWord = () => {
    useSyncStore.getState().markWordDirty('W1');
    mockLocalDirtyWordRows = [{
      id: 'W1', listId: 'L1', term: 't', definition: '', meaningKr: 'm',
      exampleEn: '', position: 0, deletedAt: null,
    }];
  };

  beforeEach(() => {
    jest.useFakeTimers();
    // 백오프 카운터는 모듈 전역이라 테스트끼리 샌다. schedulePush()가 그것을 0으로
    // 되돌리므로 그것으로 초기화하고, 그때 걸린 타이머는 버린다.
    schedulePush();
    jest.clearAllTimers();
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('끊긴 push는 dirty를 남기고, 30초 뒤 재시도가 실제로 올린다', async () => {
    markOneDirtyWord();
    mockUpsertFailsFor = 'cloud_words';

    await expect(flushPush()).rejects.toBeDefined();
    expect(useSyncStore.getState().dirtyWordIds.size).toBe(1); // 안 지웠다

    mockUpsertFailsFor = null;
    mockUpsertCalls = [];
    await jest.advanceTimersByTimeAsync(30_000);

    expect(mockUpsertCalls.map(c => c.table)).toContain('cloud_words');
    expect(useSyncStore.getState().dirtyWordIds.size).toBe(0);
  });

  it('연속 실패는 간격이 벌어진다 (30초 → 60초)', async () => {
    markOneDirtyWord();
    mockUpsertFailsFor = 'cloud_words';

    await expect(flushPush()).rejects.toBeDefined();

    mockUpsertCalls = [];
    await jest.advanceTimersByTimeAsync(30_000); // 1차 재시도 — 또 실패
    expect(mockUpsertCalls.length).toBeGreaterThan(0);

    mockUpsertCalls = [];
    await jest.advanceTimersByTimeAsync(30_000); // 아직 이르다(다음은 60초)
    expect(mockUpsertCalls).toHaveLength(0);

    mockUpsertFailsFor = null;
    await jest.advanceTimersByTimeAsync(30_000); // 누적 60초 — 2차 재시도
    expect(mockUpsertCalls.map(c => c.table)).toContain('cloud_words');
    expect(useSyncStore.getState().dirtyWordIds.size).toBe(0);
  });

  it('앞 push가 진행 중이면 스킵하되 재예약은 남긴다', async () => {
    let release: () => void = () => {};
    mockUpsertGate = new Promise<void>(r => { release = r; });
    markOneDirtyWord();

    const inFlight = flushPush();
    await Promise.resolve(); // upsert 게이트까지 진입시킨다

    await flushPush(); // pushInFlight → 스킵
    expect(jest.getTimerCount()).toBe(1); // 그냥 버리지 않았다

    mockUpsertGate = null;
    release();
    await inFlight;
  });
});
