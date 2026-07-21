/**
 * Regression: the first-login conflict prompt over-counted cloud words.
 *
 * probeFirstLoginState counted every `is_deleted = false` cloud word, ignoring
 * whether its PARENT LIST was still alive. But pullChanges SKIPS orphan words
 * (parent list soft-deleted, or list_id dangling) so they never reach a screen.
 * Result: "클라우드에 N개" reported more than the user could actually see (e.g.
 * a phantom 1001). The count must mirror pull — only words under a live list.
 */
let mockLocalWordCount = 0;

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

jest.mock('@/features/vocab/db', () => ({ clearAllData: async () => {} }));
// 로컬 카운트는 주입값으로 충분하다 — 이 스위트의 초점은 클라우드 orphan-aware
// 카운트다. 로컬 쪽 JOIN이 예전 조립 방식과 등가인지는 실제 SQLite를 돌리는
// first-login-local-count.test.ts가 검증한다.
jest.mock('@/lib/db', () => ({
  getDb: async () => ({ getFirstAsync: async () => ({ n: mockLocalWordCount }) }),
}));

jest.mock('@/lib/supabase', () => {
  const CLOUD_LISTS = [
    { id: 'L1', is_deleted: false },
    { id: 'L2', is_deleted: false },
    { id: 'L3', is_deleted: true },  // soft-deleted list
  ];
  const CLOUD_WORDS = [
    { id: 'W1', list_id: 'L1', is_deleted: false }, // live
    { id: 'W2', list_id: 'L2', is_deleted: false }, // live
    { id: 'W3', list_id: 'L2', is_deleted: false }, // live
    { id: 'W4', list_id: 'L3', is_deleted: false }, // ORPHAN: parent deleted
    { id: 'W5', list_id: 'LX', is_deleted: false }, // ORPHAN: parent missing
    { id: 'W6', list_id: 'L2', is_deleted: true },  // deleted word
  ];

  const makeQuery = (table: string) => {
    const rows: any[] = table === 'cloud_lists' ? CLOUD_LISTS : CLOUD_WORDS;
    const state: any = { onlyAlive: false, inIds: null, head: false };
    const q: any = {
      select: (_cols: string, opts: any) => { if (opts?.head) state.head = true; return q; },
      eq: (f: string, v: any) => { if (f === 'is_deleted' && v === false) state.onlyAlive = true; return q; },
      in: (_f: string, ids: any[]) => { state.inIds = ids; return q; },
      then: (resolve: any, reject: any) => {
        let data = rows;
        if (state.onlyAlive) data = data.filter(r => !r.is_deleted);
        if (state.inIds) data = data.filter(r => state.inIds.includes(r.list_id));
        const payload = state.head
          ? { count: data.length, data: null, error: null }
          : { data: data.map(r => ({ id: r.id })), error: null };
        return Promise.resolve(payload).then(resolve, reject);
      },
    };
    return q;
  };

  return { supabase: { from: (t: string) => makeQuery(t) } };
});

import { probeFirstLoginState } from '@/features/sync/first-login';

describe('probeFirstLoginState — orphan-aware cloud count', () => {
  it('counts only words under a live parent list (excludes orphans + deleted)', async () => {
    mockLocalWordCount = 2;
    const probe = await probeFirstLoginState();
    // Live: W1(L1), W2(L2), W3(L2) = 3. Excludes W4/W5 (orphans), W6 (deleted).
    // Old behavior would have returned 5 (every is_deleted=false word).
    expect(probe.cloudWordCount).toBe(3);
    expect(probe.localWordCount).toBe(2);
    expect(probe.state).toBe('conflict');
  });

  it('treats orphans-only cloud as cloud-only when local is empty', async () => {
    mockLocalWordCount = 0;
    const probe = await probeFirstLoginState();
    expect(probe.cloudWordCount).toBe(3);
    expect(probe.localWordCount).toBe(0);
    expect(probe.state).toBe('cloud-only');
  });
});
