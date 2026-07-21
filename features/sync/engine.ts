import { useAuthStore, isCloudAuthMode } from '@/features/auth';
import { getDb, runInTransaction } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import { useSyncStore } from './store';
import { vocaListToCloudRow, wordToCloudRow, dbRowToVocaList, dbRowToWord } from './mapping';
import { startLoginTimer } from '@/lib/login-timing'; // TEMP: login-latency instrumentation

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

/**
 * upsert 한 요청에 실을 최대 행 수.
 *
 * 첫 로그인의 local-only/merge 분기는 로컬 전체를 dirty로 마킹하므로(first-login.ts)
 * 이 push 한 번에 수천 행이 실린다. 거대한 JSON 한 방은 느린 회선에서 타임아웃·
 * 페이로드 한도에 걸리기 쉽고, 걸리면 **전량이** 실패한다 — 게스트 시절 데이터를
 * 계정에 올리는 바로 그 순간이라 실패 비용이 가장 큰 지점이다. 나눠 보내면 실패해도
 * 이미 올라간 청크는 서버에 남고, dirty가 그대로라 다음 시도가 다시 올리지만
 * onConflict 멱등 upsert라 중복이 생기지 않는다.
 */
const PUSH_CHUNK = 500;

async function upsertInChunks(
  table: 'cloud_lists' | 'cloud_words' | 'cloud_memorized_log',
  rows: any[],
  options: { onConflict: string; ignoreDuplicates?: boolean },
): Promise<void> {
  for (let i = 0; i < rows.length; i += PUSH_CHUNK) {
    const { error } = await supabase
      .from(table)
      .upsert(rows.slice(i, i + PUSH_CHUNK), options);
    if (error) throw error;
  }
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

  const {
    dirtyListIds, dirtyWordIds, dirtyStatDates, setIsSyncing,
    clearDirtyLists, clearDirtyWords, clearDirtyStatDates,
  } = useSyncStore.getState();
  if (dirtyListIds.size === 0 && dirtyWordIds.size === 0 && dirtyStatDates.size === 0) return;
  if (pushInFlight) return;

  const mark = startLoginTimer('push'); // TEMP: login-latency instrumentation
  pushInFlight = true;
  setIsSyncing(true);

  const listIds = Array.from(dirtyListIds);
  const wordIds = Array.from(dirtyWordIds);
  const statDates = Array.from(dirtyStatDates);

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
      await upsertInChunks('cloud_lists', cloudRows, { onConflict: 'id' });
      mark(`lists upsert (${cloudRows.length})`); // TEMP
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
      await upsertInChunks('cloud_words', cloudRows, { onConflict: 'id' });
      mark(`words upsert (${cloudRows.length}, ${PUSH_CHUNK}행씩)`); // TEMP
    }

    // 학습 통계 push. study_days는 merge_study_days RPC(서버 GREATEST 병합) —
    // plain upsert(LWW)는 다른 기기가 올려 둔 더 큰 카운트를 깎아먹는다.
    // memorized_log는 append-only라 중복 무시 upsert면 충분하다.
    if (statDates.length > 0) {
      const placeholders = statDates.map(() => '?').join(',');
      const dayRows = await db.getAllAsync<any>(
        `SELECT date, studiedCount, memorizedCount FROM study_days WHERE date IN (${placeholders})`,
        ...statDates,
      );
      if (dayRows.length > 0) {
        const { error } = await supabase.rpc('merge_study_days', {
          p_rows: dayRows.map(r => ({
            date: r.date,
            studied_count: r.studiedCount ?? 0,
            memorized_count: r.memorizedCount ?? 0,
          })),
        });
        if (error) throw error;
      }
      const logRows = await db.getAllAsync<any>(
        `SELECT date, wordId, createdAt FROM memorized_log WHERE date IN (${placeholders})`,
        ...statDates,
      );
      if (logRows.length > 0) {
        // user_id는 컬럼 default(auth.uid())가 채운다. ignoreDuplicates =
        // ON CONFLICT DO NOTHING — 이미 있는 (user, date, word) 행은 불변.
        await upsertInChunks(
          'cloud_memorized_log',
          logRows.map(r => ({ date: r.date, word_id: r.wordId, created_at_ms: r.createdAt ?? 0 })),
          { onConflict: 'user_id,date,word_id', ignoreDuplicates: true },
        );
      }
    }

    mark(`stats upsert (days ${statDates.length})`); // TEMP
    clearDirtyLists(listIds);
    clearDirtyWords(wordIds);
    clearDirtyStatDates(statDates);
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
 * pull이 로컬에 쓰는 단어 INSERT의 컬럼 수. 아래 청크 크기 계산의 입력이므로 컬럼
 * 목록을 고칠 때 반드시 함께 갱신한다(어긋나면 SQL이 통째로 실패한다).
 */
export const WORD_COLUMN_COUNT = 22;

/**
 * 한 INSERT 문에 실을 단어 행 수.
 *
 * 상한은 SQLite의 호스트 파라미터 한도다 — 넘으면 문장이 실패한다. 최신 SQLite는
 * 32766까지 받지만 expo-sqlite가 어느 빌드를 싣는지에 기대지 않고 구버전 기본값
 * 999를 기준으로 잡는다: 22컬럼 × 40행 = 880. 왕복이 행 수에서 1/40로 줄어드는
 * 것만으로 목적은 달성되므로, 한도에 바싹 붙일 이유가 없다.
 */
export const WORD_INSERT_CHUNK = 40;

/** DELETE는 행당 파라미터가 id 하나뿐이라 더 크게 묶어도 한도에 여유가 있다. */
const DELETE_CHUNK = 500;

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
async function fetchAllSince(
  table: 'cloud_lists' | 'cloud_words' | 'cloud_study_days' | 'cloud_memorized_log',
  since: number,
): Promise<any[]> {
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

  const mark = startLoginTimer('pull'); // TEMP: login-latency instrumentation
  const { lastPulledAt, setLastPulledAt, setIsSyncing } = useSyncStore.getState();
  setIsSyncing(true);
  try {
    const [lists, words, statDays, statLog] = await Promise.all([
      fetchAllSince('cloud_lists', lastPulledAt),
      fetchAllSince('cloud_words', lastPulledAt),
      fetchAllSince('cloud_study_days', lastPulledAt),
      fetchAllSince('cloud_memorized_log', lastPulledAt),
    ]);
    mark(`fetch 4 tables (lists ${lists.length}, words ${words.length}, days ${statDays.length}, log ${statLog.length})`);

    // 드레인이 완료됐으므로 배치의 max(updated_at)까지는 전부 수신했음이 보장된다.
    // 빈 배치면 워터마크를 유지한다 — 과거의 Date.now() 점프는 클라이언트 시계가
    // 서버보다 빠를 때 그 사이 서버 쓰기를 영구히 건너뛰는 구멍이었다(서버
    // updated_at과 클라이언트 시계는 다른 시계 도메인).
    const allRows = [...lists, ...words, ...statDays, ...statLog];
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
    mark(`부모 리스트 백필 (${extraLists.length})`);

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
    //
    // 단, lastPulledAt === 0(첫 동기화)에는 건너뛴다. 그때는 gt(0)이 모든 행을
    // 통과시키므로 "리스트는 왔는데 단어는 워터마크 뒤에 갇힌" 비대칭이 성립할 수
    // 없다 — 보정할 대상이 구조적으로 존재하지 않는다. 실측(첫 로그인, 단어 5,605개)에서
    // 이 조회가 2,836행을 다시 받아 전부 중복 제거에서 버렸다: 2.3초와 그만큼의
    // 트래픽이 순손실이었다.
    const aliveListIds = [...new Set([
      ...lists.filter((l: any) => !l.is_deleted).map((l: any) => l.id as string),
      ...extraLists.map((l: any) => l.id as string),
    ])];
    const listWords: any[] = lastPulledAt > 0 && aliveListIds.length > 0
      ? await fetchAliveWordsByListIds(aliveListIds)
      : [];
    // ⚠️ 이 숫자가 "이번에 바뀐 단어 수"보다 훨씬 크면 에코 증폭이다 — 학습으로
    // 리스트가 dirty→push→다음 pull에 echo로 돌아오면 그 리스트의 전 단어를
    // 다시 받는다. 개선 후보 ①(측정으로 확인할 대상).
    mark(`리스트별 단어 완전성 조회 (${listWords.length})`); // TEMP
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

      // 쓰기 대상을 먼저 모은 뒤 여러 행씩 묶어 실행한다.
      //
      // 왜: 예전엔 단어 하나마다 runAsync를 불렀고, 그 브리지 왕복이 pull의 지배적
      // 비용이었다 — 첫 로그인 실측에서 5,605행에 10.9초, 전체 로그인 시간의 37%.
      // 트랜잭션 안이라 디스크 동기화는 어차피 한 번인데 호출 오버헤드만으로 그만큼
      // 나갔다. 묶어 보내면 왕복이 행 수에서 청크 수로 줄어든다.
      const deleteIds: string[] = [];
      const insertRows: any[][] = [];
      for (const w of allWords) {
        if (w.is_deleted) {
          deleteIds.push(w.id);
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
        insertRows.push([
          word.id, w.list_id, word.term, word.definition, word.phonetic ?? null, word.pos ?? null,
          word.exampleEn, word.exampleKr ?? null, word.meaningKr,
          word.isMemorized ? 1 : 0, word.isStarred ? 1 : 0, w.tags ?? null,
          w.position, word.createdAt, word.updatedAt,
          word.wrongCount, word.assignedDay ?? null, word.sourceLang, word.targetLang,
          // null과 0을 구별해서 넣어야 한다: 0은 1970-01-01이라 "즉시 due"가 되고,
          // null이라야 "학습 이력 없음"(due 아님)으로 읽힌다.
          word.lastReviewedAt ?? null, word.reviewSuccessCount ?? 0, null,
        ]);
      }

      for (let i = 0; i < deleteIds.length; i += DELETE_CHUNK) {
        const chunk = deleteIds.slice(i, i + DELETE_CHUNK);
        await db.runAsync(
          `DELETE FROM words WHERE id IN (${chunk.map(() => '?').join(',')})`,
          chunk,
        );
      }

      // ⚠️ INSERT OR REPLACE는 행을 통째로 갈아끼운다 — 여기 빠진 컬럼은 값이
      // 보존되는 게 아니라 DEFAULT(NULL/0)로 초기화된다. 복습 컬럼을 빠뜨리면
      // pull이 내려올 때마다 그 단어의 복습 진도가 조용히 지워지고, 클라이언트는
      // lastReviewedAt이 NULL인 암기 단어를 due로 치지 않으므로 그 단어는 영영
      // 복습에 안 걸린다. 새 단어 컬럼을 추가할 때 이 목록과 WORD_COLUMN_COUNT를
      // 반드시 함께 갱신할 것(개수가 어긋나면 __tests__/sync-word-insert-batch가 잡는다).
      for (let i = 0; i < insertRows.length; i += WORD_INSERT_CHUNK) {
        const chunk = insertRows.slice(i, i + WORD_INSERT_CHUNK);
        const tuple = `(${new Array(WORD_COLUMN_COUNT).fill('?').join(', ')})`;
        await db.runAsync(
          `INSERT OR REPLACE INTO words (
            id, listId, term, definition, phonetic, pos, exampleEn, exampleKr,
            meaningKr, isMemorized, isStarred, tags, position, createdAt, updatedAt,
            wrongCount, assignedDay, sourceLang, targetLang,
            lastReviewedAt, reviewSuccessCount, deletedAt
          ) VALUES ${new Array(chunk.length).fill(tuple).join(', ')}`,
          chunk.flat(),
        );
      }

      // 학습 통계 병합. study_days는 날짜별 MAX — 서버 merge_study_days와 동일
      // 규칙이라 push/pull 어느 방향에서도 카운트가 줄어들 수 없다. 덕분에 dirty
      // 날짜도 skip 없이 병합해도 안전하다(로컬의 미전송 증가분은 MAX가 보존).
      // 클라우드가 더 컸던 날짜는 로컬이 그 값으로 올라서는 것으로 끝 — 다시
      // push할 필요 없다(서버가 이미 그 값). 로컬이 더 큰 날짜는 dirty가
      // 걸려 있어야 정상이며, 곧 push가 서버를 따라잡는다.
      for (const d of statDays) {
        await db.runAsync(
          `INSERT INTO study_days (date, studiedCount, memorizedCount, updatedAt)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(date) DO UPDATE SET
             studiedCount   = MAX(studiedCount, excluded.studiedCount),
             memorizedCount = MAX(memorizedCount, excluded.memorizedCount),
             updatedAt      = excluded.updatedAt`,
          d.date, d.studied_count ?? 0, d.memorized_count ?? 0, d.updated_at ?? 0,
        );
      }

      // memorized_log는 양방향 append-only 합집합. wordId가 로컬에 없는 단어를
      // 가리켜도 그대로 둔다 — getDayDetail이 조인 시점에 알아서 제외한다.
      for (const l of statLog) {
        await db.runAsync(
          `INSERT OR IGNORE INTO memorized_log (date, wordId, createdAt) VALUES (?, ?, ?)`,
          l.date, l.word_id, l.created_at_ms ?? 0,
        );
      }
    });
    mark(`DB 트랜잭션 쓰기 (words ${allWords.length})`); // TEMP

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
    // `?? null`이지 `?? 0`이 아니다 — 아래 pull INSERT 주석 참조.
    lastReviewedAt: r.lastReviewedAt ?? null,
    reviewSuccessCount: r.reviewSuccessCount ?? 0,
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
