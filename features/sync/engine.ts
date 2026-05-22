import { useAuthStore } from '@/features/auth';
import { getDb } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import { useSyncStore } from './store';
import { vocaListToCloudRow, wordToCloudRow, dbRowToVocaList, dbRowToWord } from './mapping';

const DEBOUNCE_MS = 30000;

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pushInFlight = false;

function isGoogleAuthed(): boolean {
  const { mode, user } = useAuthStore.getState();
  return mode === 'google' && !!user?.id;
}

export function schedulePush(): void {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void flushPush().catch(e => console.warn('[sync] push failed:', e?.message ?? e));
  }, DEBOUNCE_MS);
}

export async function flushPush(): Promise<void> {
  if (!isGoogleAuthed()) return;

  const { dirtyListIds, dirtyWordIds, setIsSyncing, setLastPulledAt, clearDirtyLists, clearDirtyWords } =
    useSyncStore.getState();
  if (dirtyListIds.size === 0 && dirtyWordIds.size === 0) return;
  if (pushInFlight) return;

  pushInFlight = true;
  setIsSyncing(true);

  const listIds = Array.from(dirtyListIds);
  const wordIds = Array.from(dirtyWordIds);

  try {
    const db = await getDb();

    if (listIds.length > 0) {
      const placeholders = listIds.map(() => '?').join(',');
      const rows = await db.getAllAsync<any>(
        `SELECT * FROM lists WHERE id IN (${placeholders})`,
        ...listIds,
      );
      const cloudRows = rows.map(r => vocaListToCloudRow(rowToVocaList(r), { deletedAt: r.deletedAt ?? null }));
      // echo-prevention: upsert + select in one request to advance watermark past our own writes
      const { data: pushedLists, error } = await supabase
        .from('cloud_lists')
        .upsert(cloudRows, { onConflict: 'id' })
        .select('updated_at');
      if (error) throw error;
      if (pushedLists && pushedLists.length > 0) {
        const maxTs = Math.max(...pushedLists.map((r: any) => r.updated_at as number));
        await setLastPulledAt(maxTs);
      }
    }

    if (wordIds.length > 0) {
      const placeholders = wordIds.map(() => '?').join(',');
      const rows = await db.getAllAsync<any>(
        `SELECT * FROM words WHERE id IN (${placeholders})`,
        ...wordIds,
      );
      const cloudRows = rows.map(r =>
        wordToCloudRow(rowToWord(r), r.listId, {
          deletedAt: r.deletedAt ?? null,
          position: r.position ?? 0,
        }),
      );
      // echo-prevention: upsert + select in one request to advance watermark past our own writes
      const { data: pushedWords, error: wordError } = await supabase
        .from('cloud_words')
        .upsert(cloudRows, { onConflict: 'id' })
        .select('updated_at');
      if (wordError) throw wordError;
      if (pushedWords && pushedWords.length > 0) {
        const maxTs = Math.max(...pushedWords.map((r: any) => r.updated_at as number));
        await setLastPulledAt(maxTs);
      }
    }

    clearDirtyLists(listIds);
    clearDirtyWords(wordIds);
  } finally {
    pushInFlight = false;
    setIsSyncing(false);
  }
}

export async function pullChanges(): Promise<void> {
  if (!isGoogleAuthed()) return;

  const { lastPulledAt, setLastPulledAt, setIsSyncing } = useSyncStore.getState();
  setIsSyncing(true);
  try {
    const [{ data: lists, error: listErr }, { data: words, error: wordErr }] = await Promise.all([
      supabase.from('cloud_lists').select('*').gt('updated_at', lastPulledAt),
      supabase.from('cloud_words').select('*').gt('updated_at', lastPulledAt),
    ]);
    if (listErr) throw listErr;
    if (wordErr) throw wordErr;

    const allRows = [...(lists ?? []), ...(words ?? [])];
    const newWatermark = allRows.length > 0
      ? Math.max(...allRows.map((r: any) => r.updated_at as number))
      : Date.now();

    const db = await getDb();

    // Parent-list backfill — fixes orphaned-word permanent loss.
    //
    // A pulled word may reference a list that is neither in this batch nor
    // already local (its parent list's updated_at is <= lastPulledAt, so the
    // `.gt(updated_at, lastPulledAt)` filter excludes it). Previously such
    // words were skipped as orphans while the watermark advanced past them —
    // so they could NEVER be pulled again, even though they live in the cloud.
    // (This is exactly how an account's words silently vanished locally.)
    //
    // Fix: fetch those parent lists directly, watermark-independent, so the
    // words below insert normally. Only alive parents are fetched; a word
    // whose parent was genuinely deleted stays skipped and the watermark
    // advances past it (correct — that's stale cloud data).
    const batchListIds = new Set((lists ?? []).map((l: any) => l.id as string));
    const localListRows = await db.getAllAsync<{ id: string }>(
      'SELECT id FROM lists WHERE deletedAt IS NULL',
    );
    const localListIds = new Set(localListRows.map(r => r.id));
    const missingParentIds = [...new Set(
      (words ?? [])
        .filter((w: any) => !w.is_deleted && !batchListIds.has(w.list_id) && !localListIds.has(w.list_id))
        .map((w: any) => w.list_id as string),
    )];
    let extraLists: any[] = [];
    if (missingParentIds.length > 0) {
      const { data: parents, error: parentErr } = await supabase
        .from('cloud_lists')
        .select('*')
        .in('id', missingParentIds)
        .eq('is_deleted', false);
      if (parentErr) throw parentErr;
      extraLists = parents ?? [];
      if (extraLists.length > 0) {
        console.warn('[sync] backfilled', extraLists.length, 'parent list(s) for orphaned words');
      }
    }

    // List→word completeness fetch — fixes the inverse asymmetry.
    //
    // A list can carry a *newer* updated_at than its own words (e.g. the list
    // row is touched by a later plan-settings change while the words stay as
    // first created). When lastPulledAt lands between the word timestamp and
    // the list timestamp, the list passes `.gt(updated_at)` but its words do
    // NOT — so the list arrives empty and its words are stranded behind the
    // watermark forever. (This is the exact cause of "list shows up but has no
    // words" after a sync.)
    //
    // Whenever a live list is part of this pull (regular batch OR backfilled
    // parent), fetch ALL its words by list_id, watermark-independent, so the
    // children always travel with the parent.
    const aliveListIds = [...new Set([
      ...(lists ?? []).filter((l: any) => !l.is_deleted).map((l: any) => l.id as string),
      ...extraLists.map((l: any) => l.id as string),
    ])];
    let listWords: any[] = [];
    if (aliveListIds.length > 0) {
      const { data: lw, error: lwErr } = await supabase
        .from('cloud_words')
        .select('*')
        .in('list_id', aliveListIds)
        .eq('is_deleted', false);
      if (lwErr) throw lwErr;
      listWords = lw ?? [];
    }
    // Merge gt-batch words with by-list words, de-duped by id. The by-list set
    // is intentionally excluded from newWatermark (it may predate it) — only
    // the regular gt batch advances the watermark.
    const wordById = new Map<string, any>();
    for (const w of (words ?? [])) wordById.set(w.id, w);
    for (const w of listWords) if (!wordById.has(w.id)) wordById.set(w.id, w);
    const allWords = [...wordById.values()];

    await db.withTransactionAsync(async () => {
      // Backfilled parents are merged into the lists loop so they populate
      // validListIds. They're intentionally excluded from newWatermark (they
      // predate it) — only the regular batch advances the watermark.
      for (const l of [...(lists ?? []), ...extraLists]) {
        if (l.is_deleted) {
          await db.runAsync('DELETE FROM words WHERE listId = ?', l.id);
          await db.runAsync('DELETE FROM lists WHERE id = ?', l.id);
          continue;
        }
        const v = dbRowToVocaList(l);
        await db.runAsync(
          `INSERT OR REPLACE INTO lists (
            id, title, isVisible, createdAt, lastStudiedAt, position, isCurated, icon,
            planTotalDays, planCurrentDay, planWordsPerDay, planStartedAt, planUpdatedAt, planFilter,
            sourceLanguage, targetLanguage,
            lastResultMemorized, lastResultTotal, lastResultPercent,
            updatedAt, deletedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            v.id, v.title, v.isVisible ? 1 : 0, v.createdAt, v.lastStudiedAt ?? null,
            v.position, v.isCurated ? 1 : 0, v.icon ?? null,
            v.planTotalDays, v.planCurrentDay, v.planWordsPerDay,
            v.planStartedAt ?? null, v.planUpdatedAt ?? null, v.planFilter,
            v.sourceLanguage, v.targetLanguage,
            v.lastResultMemorized, v.lastResultTotal, v.lastResultPercent,
            l.updated_at, null,
          ],
        );
      }

      // Guard against cloud orphan words (list soft-deleted but word not, or
      // list_id pointing to a row that no longer exists). Without this filter,
      // a single inconsistent cloud row would FK-fail the entire pull and brick
      // the device's first sync. See first-login merge flow in features/sync/first-login.ts.
      const validListRows = await db.getAllAsync<{ id: string }>(
        'SELECT id FROM lists WHERE deletedAt IS NULL',
      );
      const validListIds = new Set(validListRows.map(r => r.id));

      for (const w of allWords) {
        if (w.is_deleted) {
          await db.runAsync('DELETE FROM words WHERE id = ?', w.id);
          continue;
        }
        if (!validListIds.has(w.list_id)) {
          console.warn('[sync] skipping orphan cloud word', w.id, 'list_id', w.list_id);
          continue;
        }
        const word = dbRowToWord(w);
        await db.runAsync(
          `INSERT OR REPLACE INTO words (
            id, listId, term, definition, phonetic, pos, exampleEn, exampleKr,
            meaningKr, isMemorized, isStarred, tags, position, createdAt, updatedAt,
            wrongCount, assignedDay, sourceLang, targetLang, deletedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            word.id, w.list_id, word.term, word.definition, word.phonetic ?? null, word.pos ?? null,
            word.exampleEn, word.exampleKr ?? null, word.meaningKr,
            word.isMemorized ? 1 : 0, word.isStarred ? 1 : 0, w.tags ?? null,
            w.position, word.createdAt, word.updatedAt,
            word.wrongCount, word.assignedDay ?? null, word.sourceLang, word.targetLang, null,
          ],
        );
      }
    });

    await setLastPulledAt(newWatermark);
  } finally {
    setIsSyncing(false);
  }
}

export async function cascadeSoftDelete(listId: string): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string }>(
    'SELECT id FROM words WHERE listId = ?', listId,
  );
  const { markListDirty, markWordsDirty } = useSyncStore.getState();
  markListDirty(listId);
  if (rows.length > 0) markWordsDirty(rows.map(r => r.id));
}

// ---- Row → domain helpers ----

function rowToVocaList(r: any) {
  return {
    id: r.id,
    title: r.title,
    words: [],
    isVisible: Boolean(r.isVisible),
    createdAt: r.createdAt,
    lastStudiedAt: r.lastStudiedAt ?? undefined,
    position: r.position,
    isCurated: Boolean(r.isCurated),
    icon: r.icon ?? undefined,
    isUserShared: Boolean(r.isUserShared),
    creatorId: r.creatorId ?? undefined,
    creatorName: r.creatorName ?? undefined,
    downloadCount: r.downloadCount ?? 0,
    planTotalDays: r.planTotalDays ?? 0,
    planCurrentDay: r.planCurrentDay ?? 1,
    planWordsPerDay: r.planWordsPerDay ?? 10,
    planStartedAt: r.planStartedAt ?? undefined,
    planUpdatedAt: r.planUpdatedAt ?? undefined,
    planFilter: r.planFilter ?? 'all',
    sourceLanguage: r.sourceLanguage ?? 'en',
    targetLanguage: r.targetLanguage ?? 'ko',
    lastResultMemorized: r.lastResultMemorized ?? 0,
    lastResultTotal: r.lastResultTotal ?? 0,
    lastResultPercent: r.lastResultPercent ?? 0,
  };
}

function rowToWord(r: any) {
  return {
    id: r.id,
    term: r.term,
    definition: r.definition ?? '',
    phonetic: r.phonetic ?? undefined,
    pos: r.pos ?? undefined,
    exampleEn: r.exampleEn ?? '',
    exampleKr: r.exampleKr ?? undefined,
    meaningKr: r.meaningKr ?? '',
    isMemorized: Boolean(r.isMemorized),
    isStarred: Boolean(r.isStarred),
    tags: r.tags ? safeJsonParse(r.tags) : [],
    createdAt: r.createdAt ?? 0,
    updatedAt: r.updatedAt ?? 0,
    wrongCount: r.wrongCount ?? 0,
    assignedDay: r.assignedDay ?? null,
    sourceLang: r.sourceLang ?? 'en',
    targetLang: r.targetLang ?? 'ko',
  };
}

function safeJsonParse(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}
