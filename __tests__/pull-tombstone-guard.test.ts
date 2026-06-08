/**
 * Regression: deleted lists/words reappear after sync ("resurrection").
 *
 * A row the user soft-deleted locally but whose delete hasn't reached the cloud
 * yet (push lost to a crash/reload, or still inside the 30s debounce) is still
 * alive in the cloud. `pullChanges` must NOT INSERT OR REPLACE it back with
 * deletedAt=null. The guard keys off the local `deletedAt` tombstone (committed
 * to SQLite), covering the gt-batch, the watermark-independent completeness
 * fetch, and the parent backfill paths.
 *
 * Scenario exercised in one pull:
 *   L1  cloud=alive, local=tombstoned          → must be SKIPPED (not resurrected)
 *   L2  cloud=alive, local=alive               → normal replace (allowed)
 *   L3  cloud=deleted                          → hard-deleted locally
 *   W1  under L1, cloud=alive, local=tombstoned→ skipped (orphan: parent gone)
 *   W2  under L2, cloud=alive, local=tombstoned→ must be SKIPPED (word guard)
 *   W3  under L2, cloud=alive, local=alive     → normal replace (allowed)
 */

// Records every db.runAsync the pull issues. `mock`-prefixed so the jest.mock
// factory may reference it (jest's out-of-scope guard allows mock* names).
let mockRunCalls: { sql: string; params: any[] }[] = [];

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

// pullChanges early-returns unless google-authed.
jest.mock('@/features/auth', () => ({
  useAuthStore: { getState: () => ({ mode: 'google', user: { id: 'u1' } }) },
  isCloudAuthMode: (mode: string) => mode === 'google' || mode === 'apple',
}));

jest.mock('@/lib/supabase', () => {
  const fullList = (over: Record<string, any>) => ({
    title: 't', is_visible: true, is_curated: false, icon: null, position: 0,
    plan_total_days: 0, plan_current_day: 1, plan_words_per_day: 10,
    plan_started_at: null, plan_updated_at: null, plan_filter: 'all',
    source_language: 'en', target_language: 'ko',
    last_result_memorized: 0, last_result_total: 0, last_result_percent: 0,
    last_studied_at: null, is_user_shared: false, creator_id: null,
    creator_name: null, download_count: 0, created_at: 1000, updated_at: 2000,
    ...over,
  });
  const fullWord = (over: Record<string, any>) => ({
    term: 'w', definition: '', phonetic: null, pos: null, example_en: '',
    example_kr: null, meaning_kr: 'm', is_memorized: false, is_starred: false,
    tags: null, position: 0, wrong_count: 0, assigned_day: null,
    source_lang: 'en', target_lang: 'ko', created_at: 1000, updated_at: 2000,
    ...over,
  });

  const CLOUD_LISTS = [
    fullList({ id: 'L1', is_deleted: false }),
    fullList({ id: 'L2', is_deleted: false }),
    fullList({ id: 'L3', is_deleted: true }),
  ];
  const CLOUD_WORDS = [
    fullWord({ id: 'W1', list_id: 'L1', is_deleted: false }),
    fullWord({ id: 'W2', list_id: 'L2', is_deleted: false }),
    fullWord({ id: 'W3', list_id: 'L2', is_deleted: false }),
  ];

  const makeQuery = (rows: any[]) => {
    const state: any = { inField: null, inIds: null, onlyAlive: false };
    const q: any = {
      select: () => q,
      gt: () => q,
      in: (field: string, ids: any[]) => { state.inField = field; state.inIds = ids; return q; },
      eq: (field: string, val: any) => { if (field === 'is_deleted' && val === false) state.onlyAlive = true; return q; },
      then: (resolve: any, reject: any) => {
        let data = rows;
        if (state.inIds) data = data.filter(r => state.inIds.includes(r[state.inField]));
        if (state.onlyAlive) data = data.filter(r => !r.is_deleted);
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return q;
  };

  return {
    supabase: {
      from: (table: string) => makeQuery(table === 'cloud_lists' ? CLOUD_LISTS : CLOUD_WORDS),
    },
  };
});

jest.mock('expo-sqlite', () => {
  const { SCHEMA_VERSION } = require('@/lib/db/migrations');

  const ALIVE_LOCAL_LISTS = [{ id: 'L2' }];      // deletedAt IS NULL
  const TOMBSTONED_LISTS = [{ id: 'L1' }];        // deletedAt IS NOT NULL
  const TOMBSTONED_WORDS = [{ id: 'W1' }, { id: 'W2' }];

  const conn: any = {
    execAsync: async () => {},
    runAsync: async (sql: string, ...params: any[]) => {
      mockRunCalls.push({ sql, params });
    },
    getAllAsync: async (sql: string) => {
      const isLists = sql.includes('FROM lists');
      const isWords = sql.includes('FROM words');
      if (sql.includes('deletedAt IS NOT NULL')) {
        if (isLists) return TOMBSTONED_LISTS;
        if (isWords) return TOMBSTONED_WORDS;
      }
      if (sql.includes('deletedAt IS NULL') && isLists) return ALIVE_LOCAL_LISTS;
      return [];
    },
    getFirstAsync: async (sql: string) =>
      sql.includes('user_version') ? { user_version: SCHEMA_VERSION } : null,
    withTransactionAsync: async (task: () => Promise<void>) => { await task(); },
    closeAsync: async () => {},
  };

  return { openDatabaseAsync: async () => conn };
});

import { pullChanges } from '@/features/sync/engine';

const idsFor = (needle: string, pick: (params: any[]) => any) =>
  mockRunCalls.filter(c => c.sql.includes(needle)).map(c => pick(c.params));

describe('pullChanges — local tombstone guard (no resurrection)', () => {
  beforeEach(() => { mockRunCalls = []; });

  it('does not resurrect locally-deleted lists/words, but applies normal rows', async () => {
    await pullChanges();

    // INSERT OR REPLACE INTO lists: params = [ [id, ...] ]
    const insertedLists = idsFor('INSERT OR REPLACE INTO lists', p => p[0][0]);
    const insertedWords = idsFor('INSERT OR REPLACE INTO words', p => p[0][0]);
    // DELETE FROM lists WHERE id = ?: params = [ id ]
    const deletedLists = idsFor('DELETE FROM lists', p => p[0]);

    // Resurrection prevented:
    expect(insertedLists).not.toContain('L1'); // local tombstone wins
    expect(insertedWords).not.toContain('W1'); // orphan (parent gone)
    expect(insertedWords).not.toContain('W2'); // word-level tombstone wins

    // Normal sync still works:
    expect(insertedLists).toContain('L2');
    expect(insertedWords).toContain('W3');

    // Genuine cloud delete is applied locally:
    expect(deletedLists).toContain('L3');
  });
});
