/**
 * Vocab write-side operations. Extracted from contexts/VocabContext (step 7c-1).
 *
 * Each mutation is a plain async function — no React hooks, no `useCallback`
 * deps. Auth state is read directly from the Zustand auth store so callers
 * outside a React tree (future workers, background sync retries) can reuse
 * these.
 *
 * Every mutation that changes a row:
 *   1. performs the SQLite op via `./db`
 *   2. marks the affected list/word ids dirty in the sync store (gated on
 *      google auth — guests never push)
 *   3. schedules a debounced push via `features/sync`
 *   4. invalidates the TanStack Query `['vocab','lists']` cache so every
 *      subscriber re-renders with the new snapshot (added in 7c-4a — before
 *      this, the VocabContext wrapper was the invalidation call site)
 */
import type { VocaList, Word, PlanStatus } from '@/lib/types';
import { useAuthStore } from '@/features/auth';
import { useSyncStore, schedulePush, cascadeSoftDelete } from '@/features/sync';
import * as PlanEngine from '@/features/study/plan/engine';
import { getDb } from '@/lib/db';
import * as db from './db';
import { invalidateLists } from './queries';

// ---- Auth-gated sync helpers ------------------------------------------------

function isGoogleAuthed(): boolean {
  const { mode, user } = useAuthStore.getState();
  return mode === 'google' && !!user?.id;
}

function markListsDirty(ids: string[]): void {
  if (!isGoogleAuthed() || ids.length === 0) return;
  useSyncStore.getState().markListsDirty(ids);
}

function markWordsDirty(ids: string[]): void {
  if (!isGoogleAuthed() || ids.length === 0) return;
  useSyncStore.getState().markWordsDirty(ids);
}

/**
 * Standard mutation commit: schedule a cloud push (no-op for guests) AND
 * invalidate the lists cache so UI subscribers see the change. Every public
 * mutation ends with `await commit()` — this is the single place where the
 * read-side cache learns about write-side changes.
 */
async function commit(): Promise<void> {
  if (isGoogleAuthed()) schedulePush();
  await invalidateLists();
}

/**
 * Mark every word (including soft-deleted) under `listId` dirty. Used after
 * mergeLists / plan setup / copyWords — the target list just gained, changed,
 * or re-assigned word rows and they all need to reach the server on the next
 * push. Matches legacy VocabContext behaviour: the SELECT has no `deletedAt`
 * filter so tombstone rows get re-marked too.
 */
export async function markAllWordsInListDirty(listId: string): Promise<void> {
  if (!isGoogleAuthed()) return;
  const conn = await getDb();
  const rows = await conn.getAllAsync<{ id: string }>(
    'SELECT id FROM words WHERE listId = ?',
    listId,
  );
  markWordsDirty(rows.map(r => r.id));
}

// ---- Case-insensitive title conflict check --------------------------------
// Matches the legacy VocabContext behaviour (throws 'DUPLICATE_LIST') so
// existing Alert handlers in the UI don't need to change for 7c-1.

async function assertTitleUnique(title: string, ignoreId?: string): Promise<void> {
  const existing = await db.getLists();
  const trimmed = title.trim().toLowerCase();
  if (existing.some(l => l.id !== ignoreId && l.title.trim().toLowerCase() === trimmed)) {
    throw new Error('DUPLICATE_LIST');
  }
}

// ---- List mutations --------------------------------------------------------

export async function createList(title: string): Promise<VocaList> {
  await assertTitleUnique(title);
  const newList = await db.createList(title);
  markListsDirty([newList.id]);
  await commit();
  return newList;
}

export async function createCuratedList(
  title: string,
  icon: string,
  words: Omit<Word, 'id' | 'isMemorized'>[],
): Promise<VocaList> {
  await assertTitleUnique(title);
  const newList = await db.createCuratedList(title, icon, words);
  markListsDirty([newList.id]);
  markWordsDirty(newList.words.map(w => w.id));
  await commit();
  return newList;
}

export async function updateList(
  id: string,
  updates: Partial<Omit<VocaList, 'id' | 'words'>>,
): Promise<VocaList | null> {
  const result = await db.updateList(id, updates);
  markListsDirty([id]);
  await commit();
  return result;
}

export async function renameList(id: string, newTitle: string): Promise<void> {
  await assertTitleUnique(newTitle, id);
  await db.updateList(id, { title: newTitle });
  markListsDirty([id]);
  await commit();
}

export async function toggleVisibility(id: string): Promise<void> {
  await db.toggleVisibility(id);
  markListsDirty([id]);
  await commit();
}

/**
 * Soft-delete a list. `features/vocab/db.deleteList` already cascades to
 * child words in SQLite; `cascadeSoftDelete()` mirrors that cascade into the
 * sync dirty set so the push payload covers both.
 */
export async function deleteList(id: string): Promise<void> {
  await db.deleteList(id);
  await cascadeSoftDelete(id);
  await commit();
}

export async function mergeLists(
  sourceId: string,
  targetId: string,
  deleteSource: boolean,
): Promise<void> {
  await db.mergeLists(sourceId, targetId, deleteSource);
  markListsDirty([targetId]);
  // The target list just received new word rows — re-read and mark them dirty.
  await markAllWordsInListDirty(targetId);
  if (deleteSource) await cascadeSoftDelete(sourceId);
  await commit();
}

export async function reorderLists(orderedIds: string[]): Promise<void> {
  await db.reorderLists(orderedIds);
  markListsDirty(orderedIds);
  await commit();
}

export async function updateStudyTime(listId: string): Promise<void> {
  await db.updateStudyTime(listId);
  markListsDirty([listId]);
  await commit();
}

export async function saveLastResult(listId: string): Promise<void> {
  await db.saveLastResult(listId);
  markListsDirty([listId]);
  await commit();
}

// ---- Word mutations --------------------------------------------------------

export async function addWord(
  listId: string,
  wordData: Omit<Word, 'id' | 'isMemorized'>,
): Promise<Word> {
  const newWord = await db.addWord(listId, wordData);
  markWordsDirty([newWord.id]);
  // lastStudiedAt-ish fields aren't touched here but the list still needs to
  // show the new word count on the next pull — keep the parent in the set.
  markListsDirty([listId]);
  await commit();
  return newWord;
}

export async function addBatchWords(
  listId: string,
  wordsData: Array<Partial<Omit<Word, 'id' | 'createdAt' | 'updatedAt' | 'listId'>> & { term: string; meaningKr: string }>,
): Promise<Word[]> {
  const words = await db.addBatchWords(listId, wordsData);
  markWordsDirty(words.map(w => w.id));
  markListsDirty([listId]);
  await commit();
  return words;
}

export async function updateWord(
  listId: string,
  wordId: string,
  updates: Partial<Omit<Word, 'id'>>,
): Promise<Word | null> {
  const result = await db.updateWord(listId, wordId, updates);
  markWordsDirty([wordId]);
  markListsDirty([listId]);
  await commit();
  return result;
}

export async function deleteWord(listId: string, wordId: string): Promise<void> {
  await db.deleteWord(listId, wordId);
  markWordsDirty([wordId]);
  await commit();
}

export async function deleteWords(listId: string, wordIds: string[]): Promise<void> {
  await db.deleteWords(listId, wordIds);
  markWordsDirty(wordIds);
  await commit();
}

export async function copyWords(targetListId: string, wordIds: string[]): Promise<void> {
  await db.copyWords(targetListId, wordIds);
  // copyWords inserts new word rows with generated ids; scan the target list
  // to pick them up for the dirty set.
  await markAllWordsInListDirty(targetListId);
  markListsDirty([targetListId]);
  await commit();
}

export async function moveWords(targetListId: string, wordIds: string[]): Promise<void> {
  await db.moveWords(targetListId, wordIds);
  markWordsDirty(wordIds);
  markListsDirty([targetListId]);
  await commit();
}

export async function toggleMemorized(
  listId: string,
  wordId: string,
  forceStatus?: boolean,
): Promise<void> {
  await db.toggleMemorized(listId, wordId, forceStatus);
  markWordsDirty([wordId]);
  markListsDirty([listId]);
  await commit();
}

export async function toggleStarred(
  listId: string,
  wordId: string,
  forceStatus?: boolean,
): Promise<void> {
  await db.toggleStarred(listId, wordId, forceStatus);
  markWordsDirty([wordId]);
  markListsDirty([listId]);
  await commit();
}

export async function setWordsMemorized(
  listId: string,
  wordIds: string[],
  isMemorized: boolean,
): Promise<void> {
  await db.setWordsMemorized(listId, wordIds, isMemorized);
  markWordsDirty(wordIds);
  markListsDirty([listId]);
  await commit();
}

export async function incrementWrongCount(wordIds: string[]): Promise<void> {
  await db.incrementWrongCount(wordIds);
  markWordsDirty(wordIds);
  await commit();
}

export async function resetWrongCount(wordIds: string[]): Promise<void> {
  await db.resetWrongCount(wordIds);
  markWordsDirty(wordIds);
  await commit();
}

// ---- Plan mutations --------------------------------------------------------

// Plan mutations touch `words.assignedDay` on every word in the list, so
// `markAllWordsInListDirty()` is required for the per-word state to reach the
// server. The legacy VocabContext did this via its `markAllWordsInList` helper.

export async function setupPlan(
  listId: string,
  wordsPerDay: number,
  filter: 'all' | 'unmemorized' | 'memorized' = 'all',
): Promise<void> {
  const allLists = await db.getLists();
  const list = allLists.find(l => l.id === listId);
  if (!list) return;
  let wordsToUse = list.words;
  if (filter === 'unmemorized') wordsToUse = list.words.filter(w => !w.isMemorized);
  else if (filter === 'memorized') wordsToUse = list.words.filter(w => w.isMemorized);
  const { assignments, totalDays } = PlanEngine.generatePlan(wordsToUse, wordsPerDay);
  await db.savePlan(listId, wordsPerDay, assignments, totalDays, filter);
  markListsDirty([listId]);
  await markAllWordsInListDirty(listId);
  await commit();
}

export async function rechunkPlan(listId: string, wordsPerDay: number): Promise<void> {
  const allLists = await db.getLists();
  const list = allLists.find(l => l.id === listId);
  if (!list) return;
  const { assignments, totalDays } = PlanEngine.rechunkPlan(list.words, wordsPerDay);
  // Note: legacy VocabContext passed no `filter` arg to savePlan on rechunk
  // (defaults to 'all'). Preserved intentionally.
  await db.savePlan(listId, wordsPerDay, assignments, totalDays);
  markListsDirty([listId]);
  await markAllWordsInListDirty(listId);
  await commit();
}

export async function clearPlan(listId: string): Promise<void> {
  await db.clearPlan(listId);
  markListsDirty([listId]);
  await markAllWordsInListDirty(listId);
  await commit();
}

export async function updatePlanProgress(listId: string, currentDay: number): Promise<void> {
  await db.updatePlanProgress(listId, currentDay);
  markListsDirty([listId]);
  await commit();
}

export async function resetPlanForReStudy(listId: string): Promise<void> {
  await db.resetPlanCurrentDayToTotal(listId);
  markListsDirty([listId]);
  await commit();
}

// Re-export selected PlanStatus type so call sites importing mutations don't
// need a separate `@/lib/types` import just for the return shape.
export type { PlanStatus };
