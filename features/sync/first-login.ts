/**
 * First-time google-login reconciliation helpers (extracted from
 * contexts/VocabContext in step 7c-3).
 *
 * The flow — when `lastPulledAt === 0` (device has never synced with this
 * account):
 *
 *   1. `probeFirstLoginState()` — hit `/api/sync/pull?since=0` to count
 *      non-deleted server words, count local words, return the combined state.
 *   2. If `state === 'conflict'`, the caller prompts the user. The data
 *      layer itself is Alert-free; prompting lives in the UI layer.
 *   3. Based on the choice:
 *        - `applyFirstLoginMerge()` — remap every local id to a fresh uuid
 *          (so it can coexist with server rows having the same id) and mark
 *          everything dirty for push.
 *        - `applyFirstLoginCloudReset()` — drop local data and reset sync
 *          store so the next pull populates from cloud.
 *        - On `'cloud-only-empty'` (cloud empty, local has data) the caller
 *          calls `markAllLocalDirty()` to schedule a full upload.
 *
 * None of these functions touch `Alert` or React state; they're pure
 * SQLite/sync operations.
 */
import { getDb } from '@/lib/db';
import { supabase } from '@/lib/supabase';
// Direct (non-barrel) imports break the features/vocab ↔ features/sync require cycle:
// the vocab barrel re-exports mutations.ts, which imports back into @/features/sync.
// eslint-disable-next-line no-restricted-imports
import { fetchAllLists } from '@/features/vocab/queries';
// eslint-disable-next-line no-restricted-imports
import { generateId, clearAllData } from '@/features/vocab/db';
import { useSyncStore } from './store';

export type FirstLoginState =
  | 'both-empty'      // nothing to reconcile; regular pull suffices
  | 'cloud-only'      // cloud has data, local empty → regular pull fills local
  | 'local-only'      // local has data, cloud empty → upload everything
  | 'conflict';       // both sides non-empty → user must choose

export interface FirstLoginProbe {
  state: FirstLoginState;
  cloudWordCount: number;
  localWordCount: number;
}

/**
 * Count cloud (non-deleted) words and local words to decide the reconciliation branch.
 */
export async function probeFirstLoginState(): Promise<FirstLoginProbe> {
  const { data: cloudWords, error } = await supabase
    .from('cloud_words')
    .select('id')
    .eq('is_deleted', false);
  if (error) throw error;

  const cloudWordCount = cloudWords?.length ?? 0;
  const localLists = await fetchAllLists();
  const localWordCount = localLists.reduce((sum, l) => sum + l.words.length, 0);

  let state: FirstLoginState = 'both-empty';
  if (cloudWordCount > 0 && localWordCount > 0) state = 'conflict';
  else if (cloudWordCount > 0) state = 'cloud-only';
  else if (localWordCount > 0) state = 'local-only';

  return { state, cloudWordCount, localWordCount };
}

/**
 * Merge path: re-issue uuids for every local list + word so they can coexist
 * with any identically-id'd server rows (server does per-row LWW, so a
 * collision would silently clobber), then mark them dirty for push.
 *
 * Uses an in-transaction rewrite with FK guard flipped off — we're changing
 * parent PKs while children reference them, so the `PRAGMA foreign_keys = OFF`
 * window is required and must be scoped to the transaction.
 */
export async function applyFirstLoginMerge(): Promise<void> {
  const db = await getDb();
  const listRows = await db.getAllAsync<{ id: string }>(
    'SELECT id FROM lists WHERE deletedAt IS NULL',
  );
  const wordRows = await db.getAllAsync<{ id: string; listId: string }>(
    'SELECT id, listId FROM words WHERE deletedAt IS NULL',
  );
  if (listRows.length === 0 && wordRows.length === 0) return;

  const listIdMap = new Map<string, string>();
  for (const r of listRows) listIdMap.set(r.id, generateId());
  const wordIdMap = new Map<string, string>();
  for (const r of wordRows) wordIdMap.set(r.id, generateId());

  // PRAGMA foreign_keys cannot be changed inside a transaction (SQLite silently ignores it).
  // Disable FK enforcement before opening the transaction, then restore after.
  await db.execAsync('PRAGMA foreign_keys = OFF');
  try {
    await db.withTransactionAsync(async () => {
      for (const [oldId, newId] of listIdMap) {
        await db.runAsync('UPDATE lists SET id = ? WHERE id = ?', newId, oldId);
        await db.runAsync('UPDATE words SET listId = ? WHERE listId = ?', newId, oldId);
      }
      for (const [oldId, newId] of wordIdMap) {
        await db.runAsync('UPDATE words SET id = ? WHERE id = ?', newId, oldId);
      }
    });
  } finally {
    await db.execAsync('PRAGMA foreign_keys = ON');
  }

  const { markListsDirty, markWordsDirty } = useSyncStore.getState();
  markListsDirty(Array.from(listIdMap.values()));
  markWordsDirty(Array.from(wordIdMap.values()));
}

/**
 * Cloud-reset path: drop local data and reset the sync store. The regular
 * `pullChanges()` afterwards repopulates local SQLite from cloud.
 */
export async function applyFirstLoginCloudReset(): Promise<void> {
  await clearAllData();
  await useSyncStore.getState().resetAll();
}

/**
 * Local-only path: cloud is empty, local has data. Mark every non-deleted
 * local list + word dirty so the first push uploads everything.
 */
export async function markAllLocalDirty(): Promise<void> {
  const db = await getDb();
  const listRows = await db.getAllAsync<{ id: string }>(
    'SELECT id FROM lists WHERE deletedAt IS NULL',
  );
  const wordRows = await db.getAllAsync<{ id: string }>(
    'SELECT id FROM words WHERE deletedAt IS NULL',
  );
  const { markListsDirty, markWordsDirty } = useSyncStore.getState();
  markListsDirty(listRows.map(r => r.id));
  markWordsDirty(wordRows.map(r => r.id));
}
