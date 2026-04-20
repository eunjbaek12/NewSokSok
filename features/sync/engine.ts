import { apiFetch } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { useAuthStore } from '@/features/auth';
import { getDb } from '@/lib/db';
import {
  SyncPullResponseSchema,
  SyncPushResponseSchema,
  type CloudListPush,
  type CloudWordPush,
} from '@shared/contracts';
import { useSyncStore } from './store';
import { vocaListToCloudPush, wordToCloudPush } from './mapping';

const DEBOUNCE_MS = 2000;

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pushInFlight = false;

function getAuthForSync(): { token: string; userId: string } | null {
  const { mode, token, user } = useAuthStore.getState();
  if (mode !== 'google' || !token || !user?.id) return null;
  return { token, userId: user.id };
}

async function logout401() {
  await useAuthStore.getState().handleTokenExpired();
}

/** Schedule a push in `DEBOUNCE_MS` ms (coalesces bursts of mutations). */
export function schedulePush(): void {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void flushPush().catch(e => console.warn('[sync] push failed:', e?.message ?? e));
  }, DEBOUNCE_MS);
}

/** Immediately flush the dirty set. No-op if no auth or nothing dirty. */
export async function flushPush(): Promise<void> {
  const auth = getAuthForSync();
  if (!auth) return;

  const { dirtyListIds, dirtyWordIds, setIsSyncing, setLastPulledAt, clearDirtyLists, clearDirtyWords } =
    useSyncStore.getState();
  if (dirtyListIds.size === 0 && dirtyWordIds.size === 0) return;
  if (pushInFlight) {
    // Coalesce — another scheduler will pick up residual dirty set.
    return;
  }
  pushInFlight = true;
  setIsSyncing(true);

  const listIds = Array.from(dirtyListIds);
  const wordIds = Array.from(dirtyWordIds);

  try {
    const db = await getDb();

    const lists: CloudListPush[] = [];
    if (listIds.length > 0) {
      const placeholders = listIds.map(() => '?').join(',');
      const rows = await db.getAllAsync<any>(
        `SELECT * FROM lists WHERE id IN (${placeholders})`,
        ...listIds,
      );
      for (const r of rows) {
        lists.push(vocaListToCloudPush(rowToVocaList(r), { deletedAt: r.deletedAt ?? null }));
      }
    }

    const words: CloudWordPush[] = [];
    if (wordIds.length > 0) {
      const placeholders = wordIds.map(() => '?').join(',');
      const rows = await db.getAllAsync<any>(
        `SELECT * FROM words WHERE id IN (${placeholders})`,
        ...wordIds,
      );
      for (const r of rows) {
        words.push(
          wordToCloudPush(rowToWord(r), r.listId, {
            deletedAt: r.deletedAt ?? null,
            position: r.position ?? 0,
          }),
        );
      }
    }

    const res = await apiFetch('/api/sync/push', {
      schema: SyncPushResponseSchema,
      method: 'POST',
      body: { lists, words },
      token: auth.token,
    });

    // echo-prevention: advance lastPulledAt past our own writes immediately.
    await setLastPulledAt(res.serverTime);
    clearDirtyLists(listIds);
    clearDirtyWords(wordIds);
  } catch (e: any) {
    if (e instanceof ApiError && e.status === 401) {
      await logout401();
      return;
    }
    // Other errors: leave dirty set intact so next schedulePush retries.
    throw e;
  } finally {
    pushInFlight = false;
    setIsSyncing(false);
  }
}

/**
 * Pull changes since `lastPulledAt` and apply to SQLite in one transaction.
 * Updates lastPulledAt AFTER the transaction commits (crash-safe).
 */
export async function pullChanges(): Promise<void> {
  const auth = getAuthForSync();
  if (!auth) return;

  const { lastPulledAt, setLastPulledAt, setIsSyncing } = useSyncStore.getState();
  setIsSyncing(true);
  try {
    const res = await apiFetch(`/api/sync/pull?since=${lastPulledAt}`, {
      schema: SyncPullResponseSchema,
      method: 'GET',
      token: auth.token,
    });

    const db = await getDb();
    await db.withTransactionAsync(async () => {
      for (const l of res.lists) {
        if (l.deletedAt != null) {
          await db.runAsync('DELETE FROM words WHERE listId = ?', l.id);
          await db.runAsync('DELETE FROM lists WHERE id = ?', l.id);
          continue;
        }
        await db.runAsync(
          `INSERT OR REPLACE INTO lists (
            id, title, isVisible, createdAt, lastStudiedAt, position, isCurated, icon,
            planTotalDays, planCurrentDay, planWordsPerDay, planStartedAt, planUpdatedAt, planFilter,
            sourceLanguage, targetLanguage,
            lastResultMemorized, lastResultTotal, lastResultPercent,
            updatedAt, deletedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            l.id, l.title, l.isVisible ? 1 : 0, l.createdAt, l.lastStudiedAt ?? null,
            l.position, l.isCurated ? 1 : 0, l.icon ?? null,
            l.planTotalDays, l.planCurrentDay, l.planWordsPerDay,
            l.planStartedAt ?? null, l.planUpdatedAt ?? null, l.planFilter,
            l.sourceLanguage, l.targetLanguage,
            l.lastResultMemorized, l.lastResultTotal, l.lastResultPercent,
            l.updatedAt, null,
          ],
        );
      }

      for (const w of res.words) {
        if (w.deletedAt != null) {
          await db.runAsync('DELETE FROM words WHERE id = ?', w.id);
          continue;
        }
        await db.runAsync(
          `INSERT OR REPLACE INTO words (
            id, listId, term, definition, phonetic, pos, exampleEn, exampleKr,
            meaningKr, isMemorized, isStarred, tags, position, createdAt, updatedAt,
            wrongCount, assignedDay, sourceLang, targetLang, deletedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            w.id, w.listId, w.term, w.definition, w.phonetic ?? null, w.pos ?? null,
            w.exampleEn, w.exampleKr ?? null, w.meaningKr,
            w.isMemorized ? 1 : 0, w.isStarred ? 1 : 0, w.tags ?? null,
            w.position, w.createdAt, w.updatedAt,
            w.wrongCount, w.assignedDay ?? null, w.sourceLang, w.targetLang, null,
          ],
        );
      }
    });

    // Crash-safe: only advance the high-water mark after commit.
    await setLastPulledAt(res.serverTime);
  } catch (e: any) {
    if (e instanceof ApiError && e.status === 401) {
      await logout401();
      return;
    }
    throw e;
  } finally {
    setIsSyncing(false);
  }
}

/**
 * Cascade soft-delete: mark list + all its non-deleted words dirty.
 * Called from features/vocab (step 7b) after `softDeleteList()` in the DB.
 */
export async function cascadeSoftDelete(listId: string): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string }>(
    'SELECT id FROM words WHERE listId = ?', listId,
  );
  const { markListDirty, markWordsDirty } = useSyncStore.getState();
  markListDirty(listId);
  if (rows.length > 0) markWordsDirty(rows.map(r => r.id));
}

// ---- Row → domain helpers (mirror features/vocab/db.getLists assembler) ----

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
