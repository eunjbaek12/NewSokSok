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
 *        - `applyFirstLoginMerge()` — keep local rows under their existing ids
 *          and mark them dirty for push (random-uuid ids can't collide, so the
 *          upsert is idempotent and won't orphan/duplicate cloud rows).
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
import { clearAllData } from '@/features/vocab/db';
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
  // count: 'exact' + head: true returns the true row count without fetching
  // rows. A plain .select('id') is capped at Supabase's default 1000-row page,
  // so .length would silently max out at 1000 — making the conflict prompt
  // report "1000" for any account with ≥1000 cloud words.
  const { count, error } = await supabase
    .from('cloud_words')
    .select('*', { count: 'exact', head: true })
    .eq('is_deleted', false);
  if (error) throw error;

  const cloudWordCount = count ?? 0;
  const localLists = await fetchAllLists();
  const localWordCount = localLists.reduce((sum, l) => sum + l.words.length, 0);

  let state: FirstLoginState = 'both-empty';
  if (cloudWordCount > 0 && localWordCount > 0) state = 'conflict';
  else if (cloudWordCount > 0) state = 'cloud-only';
  else if (localWordCount > 0) state = 'local-only';

  return { state, cloudWordCount, localWordCount };
}

/**
 * Merge path: keep every live local list + word with its existing id and just
 * mark them dirty so the next push uploads them alongside the cloud's rows.
 *
 * We deliberately do NOT re-issue ids. All ids are `Crypto.randomUUID()`
 * (see features/vocab/db.generateId — sample/curated/regular alike), so a
 * collision with a server row is cryptographically impossible. The old
 * re-issue (rewrite every id to a fresh uuid before pushing) was the source of
 * orphan/duplicate cloud rows: each merge uploaded the same data under a brand
 * new id, abandoning the previously-uploaded rows in the cloud (the client no
 * longer references their ids, so it can never delete them). Pushing under the
 * existing id makes the upsert (onConflict: 'id') idempotent — a re-upload
 * updates the same row instead of spawning a duplicate.
 */
export async function applyFirstLoginMerge(): Promise<void> {
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
