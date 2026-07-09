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
  const cloudWordCount = await countLiveCloudWords();
  const localLists = await fetchAllLists();
  const localWordCount = localLists.reduce((sum, l) => sum + l.words.length, 0);

  let state: FirstLoginState = 'both-empty';
  if (cloudWordCount > 0 && localWordCount > 0) state = 'conflict';
  else if (cloudWordCount > 0) state = 'cloud-only';
  else if (localWordCount > 0) state = 'local-only';

  return { state, cloudWordCount, localWordCount };
}

/**
 * Count cloud words that are actually visible to the user — i.e. non-deleted
 * words whose PARENT LIST is also non-deleted. This mirrors pullChanges, which
 * SKIPS "orphan" cloud words (parent list soft-deleted, or list_id dangling) so
 * they never reach local SQLite or any screen (see engine.ts orphan guard).
 *
 * Counting every `is_deleted = false` word regardless of its parent — the old
 * behavior — over-reported the conflict prompt: a stale orphan word inflated
 * "클라우드에 N개" past what the user can actually see (and could even force a
 * spurious 'conflict'/'cloud-only' branch when the only surviving cloud rows are
 * orphans). Orphans accrue from e.g. a list deleted while its words weren't
 * re-marked — the same class of leftover cleaned up in cc5ebd8.
 *
 * Two-step (fetch live list ids, then count words within them) instead of a
 * PostgREST inner-join so we don't depend on the cloud_words→cloud_lists foreign
 * key being introspectable as an embeddable relationship. RLS scopes both
 * queries to the current user.
 */
async function countLiveCloudWords(): Promise<number> {
  // Live parent lists. .select('id') is capped at Supabase's default 1000-row
  // page; a user with >1000 lists is unrealistic, so we don't paginate here.
  const { data: aliveLists, error: listErr } = await supabase
    .from('cloud_lists')
    .select('id')
    .eq('is_deleted', false);
  if (listErr) throw listErr;
  const aliveListIds = (aliveLists ?? []).map((l: { id: string }) => l.id);
  if (aliveListIds.length === 0) return 0;

  // count: 'exact' + head: true returns the true row count without fetching
  // rows (a plain .select would cap at the 1000-row page). Chunk the list-id
  // filter so the .in() set can't blow past PostgREST's request URL length for
  // heavy users with hundreds of lists.
  const CHUNK = 100;
  let total = 0;
  for (let i = 0; i < aliveListIds.length; i += CHUNK) {
    const chunk = aliveListIds.slice(i, i + CHUNK);
    const { count, error } = await supabase
      .from('cloud_words')
      .select('*', { count: 'exact', head: true })
      .eq('is_deleted', false)
      .in('list_id', chunk);
    if (error) throw error;
    total += count ?? 0;
  }
  return total;
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

/**
 * 로컬 학습 통계(study_days) 전 날짜를 push 대상으로 마킹. 첫 로그인
 * (lastPulledAt === 0)의 모든 분기에서 호출된다 — 게스트 시절 쌓인 스트릭·달력
 * 기록을 계정에 업로드하기 위함. 단어 probe 분기(conflict/cloud-only/…)와
 * 무관하게 항상 안전하다: 서버는 날짜별 GREATEST 병합이라 클라우드 기존 기록을
 * 깎지 않고, cloud-reset 직후에는 테이블이 비어 있어 no-op이다.
 */
export async function markAllLocalStatsDirty(): Promise<void> {
  const db = await getDb();
  const dayRows = await db.getAllAsync<{ date: string }>(
    'SELECT date FROM study_days',
  );
  if (dayRows.length > 0) {
    useSyncStore.getState().markStatDatesDirty(dayRows.map(r => r.date));
  }
}
