import { useAuthStore, isCloudAuthMode } from '@/features/auth';
import { getDb, runInTransaction } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import { useSyncStore } from './store';
import { vocaListToCloudRow, wordToCloudRow, dbRowToVocaList, dbRowToWord } from './mapping';

const DEBOUNCE_MS = 30000;

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pushInFlight = false;

// 클라우드 동기화 대상 = Google 또는 Apple 로그인 사용자(둘 다 Supabase 세션 보유).
// Apple도 포함해야 Apple 사용자 데이터가 클라우드에 백업되고, 로그아웃 시 wipe가
// 안전해진다(미동기 상태로 wipe하면 데이터 유실).
function isCloudAuthed(): boolean {
  const { mode, user } = useAuthStore.getState();
  return isCloudAuthMode(mode) && !!user?.id;
}

export function schedulePush(): void {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void flushPush().catch(e => console.warn('[sync] push failed:', e?.message ?? e));
  }, DEBOUNCE_MS);
}

export async function flushPush(): Promise<void> {
  if (!isCloudAuthed()) return;

  const { dirtyListIds, dirtyWordIds, setIsSyncing, clearDirtyLists, clearDirtyWords } =
    useSyncStore.getState();
  if (dirtyListIds.size === 0 && dirtyWordIds.size === 0) return;
  if (pushInFlight) return;

  pushInFlight = true;
  setIsSyncing(true);

  const listIds = Array.from(dirtyListIds);
  const wordIds = Array.from(dirtyWordIds);

  try {
    const db = await getDb();

    // 워터마크(lastPulledAt)는 push에서 절대 전진시키지 않는다. 과거의
    // "echo-prevention"(push한 행의 서버 updated_at으로 워터마크 점프)은 그
    // 사이에 다른 기기가 push해 둔, 아직 pull하지 않은 행들을 영원히
    // 건너뛰었다(워터마크가 그 행들의 updated_at을 넘어가므로). 자기 push의
    // echo는 다음 pull에서 한 번 되받는 대신(멱등 REPLACE라 무해), 아직
    // push되지 않은 로컬 수정의 echo-덮어쓰기는 pull 쪽 dirty-skip 가드가
    // 막는다.
    if (listIds.length > 0) {
      const placeholders = listIds.map(() => '?').join(',');
      const rows = await db.getAllAsync<any>(
        `SELECT * FROM lists WHERE id IN (${placeholders})`,
        ...listIds,
      );
      const cloudRows = rows.map(r => vocaListToCloudRow(rowToVocaList(r), { deletedAt: r.deletedAt ?? null }));
      const { error } = await supabase
        .from('cloud_lists')
        .upsert(cloudRows, { onConflict: 'id' });
      if (error) throw error;
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
      const { error: wordError } = await supabase
        .from('cloud_words')
        .upsert(cloudRows, { onConflict: 'id' });
      if (wordError) throw wordError;
    }

    clearDirtyLists(listIds);
    clearDirtyWords(wordIds);
  } finally {
    pushInFlight = false;
    setIsSyncing(false);
  }
}

// PostgREST는 응답을 서버 설정 max-rows(호스티드 기본 1000행)로 자르고, 잘렸다는
// 신호는 주지 않는다. 페이지 크기는 그 캡보다 확실히 작게 잡아야 "꽉 찬 페이지 =
// 더 있음, 짧은 페이지 = 끝" 판정이 성립한다(캡과 같으면 캡에 잘린 페이지를
// 마지막 페이지로 오판해 조용히 유실 — 이번 "다른 기기에서 단어 사라짐"의 주범).
export const PULL_PAGE = 500;

/**
 * updated_at > since 행 전체를 (updated_at, id) 키셋 페이지네이션으로 드레인.
 *
 * offset(.range) 대신 키셋인 이유: 페이지네이션 도중 어떤 행이 갱신되면 그 행은
 * 정렬 끝으로 이동하고 뒤 행들이 한 칸씩 앞으로 밀린다 — offset 방식은 밀려
 * 들어온 행을 이미 읽은 구간으로 놓친다. 키셋은 커서 뒤로 행이 이동할 수 없어
 * (updated_at은 단조 증가) 누락이 구조적으로 불가능하다. updated_at은 배치
 * upsert 시 여러 행이 같은 값을 갖므로(트리거가 statement 시각으로 통일) id를
 * 타이브레이커로 쓴다.
 */
async function fetchAllSince(table: 'cloud_lists' | 'cloud_words', since: number): Promise<any[]> {
  const rows: any[] = [];
  let cursor: { ts: number; id: string } | null = null;
  for (;;) {
    let q = supabase
      .from(table)
      .select('*')
      .order('updated_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(PULL_PAGE);
    q = cursor
      ? q.or(`updated_at.gt.${cursor.ts},and(updated_at.eq.${cursor.ts},id.gt.${cursor.id})`)
      : q.gt('updated_at', since);
    const { data, error } = await q;
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PULL_PAGE) return rows;
    const last = page[page.length - 1];
    cursor = { ts: last.updated_at as number, id: last.id as string };
  }
}

/** 지정한 단어장들의 살아있는 단어 전체. .in()은 100개씩 청크(URL 길이), 각 청크는 id 키셋으로 드레인. */
async function fetchAliveWordsByListIds(listIds: string[]): Promise<any[]> {
  const rows: any[] = [];
  const CHUNK = 100;
  for (let i = 0; i < listIds.length; i += CHUNK) {
    const chunk = listIds.slice(i, i + CHUNK);
    let cursor: string | null = null;
    for (;;) {
      let q = supabase
        .from('cloud_words')
        .select('*')
        .in('list_id', chunk)
        .eq('is_deleted', false)
        .order('id', { ascending: true })
        .limit(PULL_PAGE);
      if (cursor) q = q.gt('id', cursor);
      const { data, error } = await q;
      if (error) throw error;
      const page = data ?? [];
      rows.push(...page);
      if (page.length < PULL_PAGE) break;
      cursor = page[page.length - 1].id as string;
    }
  }
  return rows;
}

/** 지정한 id의 살아있는 단어장들. .in()은 100개씩 청크(청크 ≤ 100행이라 페이지 캡과 무관). */
async function fetchAliveListsByIds(ids: string[]): Promise<any[]> {
  const rows: any[] = [];
  const CHUNK = 100;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await supabase
      .from('cloud_lists')
      .select('*')
      .in('id', ids.slice(i, i + CHUNK))
      .eq('is_deleted', false);
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return rows;
}

export async function pullChanges(): Promise<void> {
  if (!isCloudAuthed()) return;

  const { lastPulledAt, setLastPulledAt, setIsSyncing } = useSyncStore.getState();
  setIsSyncing(true);
  try {
    const [lists, words] = await Promise.all([
      fetchAllSince('cloud_lists', lastPulledAt),
      fetchAllSince('cloud_words', lastPulledAt),
    ]);

    // 드레인이 완료됐으므로 배치의 max(updated_at)까지는 전부 수신했음이 보장된다.
    // 빈 배치면 워터마크를 유지한다 — 과거의 Date.now() 점프는 클라이언트 시계가
    // 서버보다 빠를 때 그 사이 서버 쓰기를 영구히 건너뛰는 구멍이었다(서버
    // updated_at과 클라이언트 시계는 다른 시계 도메인).
    const allRows = [...lists, ...words];
    const newWatermark = allRows.length > 0
      ? Math.max(...allRows.map((r: any) => r.updated_at as number))
      : lastPulledAt;

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
    const batchListIds = new Set(lists.map((l: any) => l.id as string));
    const localListRows = await db.getAllAsync<{ id: string }>(
      'SELECT id FROM lists WHERE deletedAt IS NULL',
    );
    const localListIds = new Set(localListRows.map(r => r.id));
    const missingParentIds = [...new Set(
      words
        .filter((w: any) => !w.is_deleted && !batchListIds.has(w.list_id) && !localListIds.has(w.list_id))
        .map((w: any) => w.list_id as string),
    )];
    let extraLists: any[] = [];
    if (missingParentIds.length > 0) {
      extraLists = await fetchAliveListsByIds(missingParentIds);
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
      ...lists.filter((l: any) => !l.is_deleted).map((l: any) => l.id as string),
      ...extraLists.map((l: any) => l.id as string),
    ])];
    const listWords: any[] = aliveListIds.length > 0
      ? await fetchAliveWordsByListIds(aliveListIds)
      : [];
    // Merge gt-batch words with by-list words, de-duped by id. The by-list set
    // is intentionally excluded from newWatermark (it may predate it) — only
    // the regular gt batch advances the watermark.
    const wordById = new Map<string, any>();
    for (const w of words) wordById.set(w.id, w);
    for (const w of listWords) if (!wordById.has(w.id)) wordById.set(w.id, w);
    const allWords = [...wordById.values()];

    await runInTransaction(async () => {
      // Local soft-delete protection. A row the user deleted locally whose
      // delete hasn't reached the cloud yet (dirty push lost to a crash/reload,
      // or still inside the debounce window) is still alive in the cloud.
      // Without this guard the INSERT OR REPLACE below would write it back with
      // deletedAt = null and resurrect a "deleted" list/word. We key off the
      // local `deletedAt` tombstone (committed to SQLite, so it survives a
      // reload) rather than an updatedAt comparison: cloud `updated_at` (server
      // clock) and local `updatedAt` (client Date.now) live in different clock
      // domains — and pull even writes server timestamps into the local column —
      // so a last-writer-wins timestamp compare would be unreliable. Trade-off:
      // a genuine remote un-delete from another device is ignored (delete wins),
      // which is the right call for this single-user app.
      const tombstonedListRows = await db.getAllAsync<{ id: string }>(
        'SELECT id FROM lists WHERE deletedAt IS NOT NULL',
      );
      const tombstonedListIds = new Set(tombstonedListRows.map(r => r.id));
      const tombstonedWordRows = await db.getAllAsync<{ id: string }>(
        'SELECT id FROM words WHERE deletedAt IS NOT NULL',
      );
      const tombstonedWordIds = new Set(tombstonedWordRows.map(r => r.id));

      // Dirty-skip 가드: 아직 push되지 않은 로컬 수정(dirty)이 있는 행은 pull이
      // 덮어쓰지 않는다. push가 워터마크를 전진시키지 않으므로 자기 쓰기의
      // echo(또는 더 오래된 클라우드 복사본)가 pull에 되돌아오는데, 그대로
      // REPLACE하면 디바운스 창 안의 편집이 옛 데이터로 롤백된 채 다음 push에
      // 실려 영구 유실된다. 로컬 수정은 곧 push로 클라우드에 반영되므로 로컬
      // 우선이 맞다. 단, 클라우드 삭제(is_deleted)는 이 가드보다 먼저 처리 —
      // 삭제 우선 원칙(위 tombstone 가드 주석 참조)과 일관되게 유지한다.
      const { dirtyListIds, dirtyWordIds } = useSyncStore.getState();

      // Backfilled parents are merged into the lists loop so they populate
      // validListIds. They're intentionally excluded from newWatermark (they
      // predate it) — only the regular batch advances the watermark.
      for (const l of [...lists, ...extraLists]) {
        if (l.is_deleted) {
          await db.runAsync('DELETE FROM words WHERE listId = ?', l.id);
          await db.runAsync('DELETE FROM lists WHERE id = ?', l.id);
          continue;
        }
        // Keep the local delete; don't resurrect it from the alive cloud copy.
        if (tombstonedListIds.has(l.id)) continue;
        // Keep the pending local edit; the upcoming push will publish it.
        if (dirtyListIds.has(l.id)) continue;
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
        // Keep the local delete; don't resurrect it from the alive cloud copy.
        if (tombstonedWordIds.has(w.id)) continue;
        // Keep the pending local edit; the upcoming push will publish it.
        if (dirtyWordIds.has(w.id)) continue;
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
