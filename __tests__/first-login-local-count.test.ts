/**
 * 첫 로그인 probe의 **로컬 단어 수**가 예전 조립 방식과 등가임을 지킨다.
 *
 * probeFirstLoginState는 원래 `fetchAllLists()`로 전 리스트+단어를 메모리에 조립한 뒤
 * `words.length`를 합산했다. 개수만 필요한데 단어 수만큼 행 변환이 도는 데다, 바로 뒤의
 * pullChanges가 같은 데이터를 다시 다루므로 COUNT 한 방으로 바꿨다.
 *
 * 왜 테스트가 필요한가: 이 카운트는 단순한 표시값이 아니라 **분기 조건**이다. 0으로
 * 잘못 세면 'cloud-only'로 빠져 로컬이 그대로 클라우드로 덮이고, 반대로 부풀리면
 * 있지도 않은 conflict 프롬프트가 뜬다. 특히 'conflict'에서 사용자가 "클라우드 유지"를
 * 고르면 applyFirstLoginCloudReset이 **로컬을 지운다** — 게스트 시절 데이터가 걸린
 * 자리라 오차의 대가가 데이터 유실이다.
 *
 * 등가의 핵심은 고아 단어다: 부모 리스트가 소프트 삭제된 단어는 어느 리스트의 `words`
 * 배열에도 담기지 않아 예전 합계에서 빠졌고, 새 SQL도 JOIN으로 같은 것을 배제해야 한다.
 * 순수 함수로는 검증할 수 없어(SQL 한 덩어리가 전부다) node:sqlite 위에 expo-sqlite
 * 표면만 흉내내 진짜 db.ts를 돌린다 — review-memorize-entry.test.ts와 같은 수법.
 */
let DatabaseSync: any;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch {
  DatabaseSync = null;
}

const describeIfSqlite = DatabaseSync ? describe : describe.skip;

// node:sqlite는 모듈 팩토리 안에서 열어야 한다 — jest.mock은 import보다 먼저 끌어올려진다.
jest.mock('expo-sqlite', () => {
  const { DatabaseSync: DS } = require('node:sqlite');
  const raw = new DS(':memory:');
  const flatten = (params: any[]) =>
    params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
  const coerce = (p: any[]) =>
    p.map(v => (typeof v === 'boolean' ? (v ? 1 : 0) : v === undefined ? null : v));
  const db = {
    execAsync: async (sql: string) => { raw.exec(sql); },
    runAsync: async (sql: string, ...params: any[]) => {
      raw.prepare(sql).run(...coerce(flatten(params)));
    },
    getAllAsync: async (sql: string, ...params: any[]) => raw.prepare(sql).all(...coerce(flatten(params))),
    getFirstAsync: async (sql: string, ...params: any[]) =>
      raw.prepare(sql).all(...coerce(flatten(params)))[0] ?? null,
    withTransactionAsync: async (cb: any) => { await cb(); },
    closeAsync: async () => { raw.close(); },
  };
  return { openDatabaseAsync: async () => db };
});

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('@/features/stats', () => ({ recordMemorizedWords: jest.fn(async () => {}) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => `id-${Math.random().toString(36).slice(2)}` }));
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

// 클라우드는 비어 있다 — 이 스위트는 로컬 카운트만 본다. cloud_lists가 빈 배열이면
// countLiveCloudWords가 단어 조회 없이 0을 반환한다.
jest.mock('@/lib/supabase', () => {
  const q: any = {
    select: () => q,
    eq: () => q,
    in: () => q,
    then: (resolve: any, reject: any) =>
      Promise.resolve({ data: [], count: 0, error: null }).then(resolve, reject),
  };
  return { supabase: { from: () => q } };
});

const { getLists, createList, addWord, deleteList, deleteWord } = require('../features/vocab/db');
const { probeFirstLoginState } = require('../features/sync/first-login');

/** 예전 구현 그대로: 조립된 리스트들의 words 길이 합. */
async function legacyLocalWordCount(): Promise<number> {
  const lists = await getLists();
  return lists.reduce((sum: number, l: any) => sum + l.words.length, 0);
}

describeIfSqlite('probeFirstLoginState — 로컬 카운트가 조립 방식과 등가', () => {
  it('살아있는 단어만 세고, 고아·삭제 단어는 양쪽 모두에서 빠진다', async () => {
    const alive = await createList('살아있는 단어장');
    await addWord(alive.id, { term: 'apple', definition: '사과', meaningKr: '사과', exampleEn: '' });
    await addWord(alive.id, { term: 'banana', definition: '바나나', meaningKr: '바나나', exampleEn: '' });

    // 삭제된 단어 — 부모는 살아있다.
    const doomedWord = await addWord(alive.id, { term: 'gone', definition: '삭제', meaningKr: '삭제', exampleEn: '' });
    await deleteWord(alive.id, doomedWord.id);

    // 고아 단어 — 단어는 살아있는데 부모 리스트가 소프트 삭제됐다.
    const doomedList = await createList('삭제될 단어장');
    await addWord(doomedList.id, { term: 'orphan', definition: '고아', meaningKr: '고아', exampleEn: '' });
    await deleteList(doomedList.id);

    const legacy = await legacyLocalWordCount();
    const probe = await probeFirstLoginState();

    expect(legacy).toBe(2);
    expect(probe.localWordCount).toBe(legacy);
    // 클라우드가 비었고 로컬에 데이터가 있으므로 전체 업로드 분기.
    expect(probe.state).toBe('local-only');
  });

  it('로컬이 비면 0 — 클라우드도 비었으니 both-empty', async () => {
    const { clearAllData } = require('../features/vocab/db');
    await clearAllData();

    const probe = await probeFirstLoginState();

    expect(await legacyLocalWordCount()).toBe(0);
    expect(probe.localWordCount).toBe(0);
    expect(probe.state).toBe('both-empty');
  });
});
