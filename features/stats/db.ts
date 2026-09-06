import { getDb } from '@/lib/db';
import { useAuthStore, isCloudAuthMode } from '@/features/auth';
// Direct (non-barrel) imports break the features/sync ↔ features/stats require
// cycle: the sync barrel re-exports first-login.ts → features/vocab/db.ts →
// features/stats barrel → this module. store/engine 자체는 stats/vocab을
// import하지 않아 직접 경로는 순환이 없다.
// eslint-disable-next-line no-restricted-imports
import { useSyncStore } from '@/features/sync/store';
// eslint-disable-next-line no-restricted-imports
import { schedulePush } from '@/features/sync/engine';
import { todayStr, startOfWeekStr } from './date';
import {
  COMPLETION_DAYS_SQL, COMPLETION_LAST_TERM_SQL, COMPLETION_RECORD_SQL,
  COMPLETION_BACKFILL_SQL, COMPLETION_LIST_SQL, COMPLETION_SUMMARY_SQL,
  COMPLETION_FOR_PLAN_SQL,
} from './completion';
import { computeStreak, computeLongestStreak, sumMemorized, type StudyDay } from './streak';

/**
 * 로컬 통계 변경을 클라우드 push 대상으로 마킹(게스트는 no-op). 단어 mutation의
 * markWordsDirty + schedulePush와 같은 계약 — 30초 디바운스에 합류한다.
 */
function markStatDateDirtyAndSchedule(date: string): void {
  const { mode, user } = useAuthStore.getState();
  if (!isCloudAuthMode(mode) || !user?.id) return;
  useSyncStore.getState().markStatDatesDirty([date]);
  schedulePush();
}

/**
 * 오늘 행을 UPSERT. studied/memorized 델타를 누적한다. 단일 문장이라 트랜잭션 불필요
 * — 절대 호출자의 트랜잭션 안에서 부르지 말 것(중첩 트랜잭션 크래시). 항상 트랜잭션
 * 커밋 이후에 호출한다.
 */
async function upsertToday(studiedDelta: number, memorizedDelta: number): Promise<void> {
  const db = await getDb();
  const date = todayStr();
  await db.runAsync(
    `INSERT INTO study_days (date, studiedCount, memorizedCount, updatedAt)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       studiedCount   = studiedCount + excluded.studiedCount,
       memorizedCount = memorizedCount + excluded.memorizedCount,
       updatedAt      = excluded.updatedAt`,
    date, studiedDelta, memorizedDelta, Date.now()
  );
  // 같은 날짜의 memorized_log 행도 push가 date 기준으로 함께 실어 나른다 —
  // recordMemorizedWords는 로그 삽입 후 여기(upsertToday)를 반드시 지난다.
  markStatDateDirtyAndSchedule(date);
}

/** 학습 세션 완료 기록(복습한 단어 수). 오늘을 '학습일'로 마킹. */
export async function recordStudySession(studiedCount: number): Promise<void> {
  if (studiedCount <= 0) return;
  await upsertToday(studiedCount, 0);
}

/**
 * 새로 외운 단어 기록(미암기→암기 전환분). 오늘을 '학습일'로 마킹하고,
 * "그날 외운 단어" 목록(memorized_log)에 참조를 남긴다.
 *
 * study_days.memorizedCount는 로그에 실제로 새로 들어간 행 수만큼만 증가한다 —
 * 같은 날 미암기↔암기를 반복해도 그날 요약(N개)과 목록 길이가 어긋나지 않는다.
 * 트랜잭션 커밋 이후에만 호출할 것(upsertToday와 동일 규칙).
 */
export async function recordMemorizedWords(wordIds: string[]): Promise<void> {
  if (wordIds.length === 0) return;
  const db = await getDb();
  const date = todayStr();
  const now = Date.now();
  // SQLite 파라미터 한도(999) 회피: 300행 × 3파라미터 단위로 나눠 삽입.
  const CHUNK = 300;
  let inserted = 0;
  for (let i = 0; i < wordIds.length; i += CHUNK) {
    const chunk = wordIds.slice(i, i + CHUNK);
    const values = chunk.map(() => '(?, ?, ?)').join(',');
    // 🔴 한 배치에 같은 now 를 찍으면 «마지막으로 외운 단어»가 없어진다 — 10개를 한 세션에
    //    외우면 열 행의 (date, createdAt) 이 전부 같아져 ORDER BY 가 무승부가 되고, 상장이
    //    같은 완주를 두고 매번 다른 단어를 보여 준다(실기에서 evaluate → analyze 로 바뀌었다).
    //    인덱스를 더해 표시한 순서를 남긴다. 배치가 커도 밀리초 단위라 날짜에는 영향이 없다.
    const params = chunk.flatMap((id, j) => [date, id, now + i + j]);
    const r = await db.runAsync(
      `INSERT OR IGNORE INTO memorized_log (date, wordId, createdAt) VALUES ${values}`,
      ...params
    );
    inserted += r.changes ?? 0;
  }
  if (inserted > 0) await upsertToday(0, inserted);
}

export async function getAllStudyDays(): Promise<StudyDay[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    `SELECT date, studiedCount, memorizedCount FROM study_days`
  );
  return rows.map(r => ({
    date: r.date,
    studiedCount: r.studiedCount ?? 0,
    memorizedCount: r.memorizedCount ?? 0,
  }));
}

/** 현재 외운 단어 총계(라이브 스냅샷). study_days와 무관하게 words에서 직접 집계. */
export async function getMemorizedTotal(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) as n FROM words WHERE isMemorized = 1 AND deletedAt IS NULL`
  );
  return row?.n ?? 0;
}

export interface StatsSummary {
  currentStreak: number;
  longestStreak: number;
  /** 현재 암기 상태인 단어 총수(라이브 인벤토리 — 미암기로 되돌리면 감소). */
  totalMemorized: number;
  /** 오늘/이번 주에 새로 외운 단어 수(활동 기록 — 되돌려도 불변). */
  todayMemorized: number;
  weekMemorized: number;
  totalDays: number;
  days: StudyDay[];
}

export async function getStatsSummary(): Promise<StatsSummary> {
  const [days, totalMemorized] = await Promise.all([getAllStudyDays(), getMemorizedTotal()]);
  const today = todayStr();
  const weekStart = startOfWeekStr();
  return {
    currentStreak: computeStreak(days, today),
    longestStreak: computeLongestStreak(days),
    totalMemorized,
    todayMemorized: days.find(d => d.date === today)?.memorizedCount ?? 0,
    weekMemorized: sumMemorized(days, d => d >= weekStart),
    totalDays: days.length,
    days,
  };
}

export interface DayWordEntry {
  id: string;
  term: string;
  meaningKr: string;
  /** 현재 암기 상태. false면 목록에서 "미암기" 배지로 표시. */
  isMemorized: boolean;
}

export interface DayDetail {
  date: string;
  studiedCount: number;
  memorizedCount: number;
  /** 이날 로그 행 수(삭제된 단어 포함). memorizedCount>0인데 0이면 로그 도입 이전 기록. */
  logCount: number;
  /** 이날 외운 단어(삭제된 단어 제외, 외운 순서). */
  words: DayWordEntry[];
}

/** 달력 날짜 탭 상세. 단어 내용은 words 테이블에서 조인해 항상 최신을 보여준다. */
export async function getDayDetail(date: string): Promise<DayDetail> {
  const db = await getDb();
  const [dayRow, logRow, rows] = await Promise.all([
    db.getFirstAsync<{ s: number; m: number }>(
      `SELECT studiedCount as s, memorizedCount as m FROM study_days WHERE date = ?`, date),
    db.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) as n FROM memorized_log WHERE date = ?`, date),
    db.getAllAsync<any>(
      `SELECT w.id, w.term, w.meaningKr, w.isMemorized
         FROM memorized_log l JOIN words w ON w.id = l.wordId
        WHERE l.date = ? AND w.deletedAt IS NULL
        ORDER BY l.createdAt ASC, w.term ASC`, date),
  ]);
  return {
    date,
    studiedCount: dayRow?.s ?? 0,
    memorizedCount: dayRow?.m ?? 0,
    logCount: logRow?.n ?? 0,
    words: rows.map((w: any) => ({
      id: w.id,
      term: w.term,
      meaningKr: w.meaningKr ?? '',
      isMemorized: (w.isMemorized ?? 0) === 1,
    })),
  };
}

/** 완주 상장에 새길 두 값. 둘 다 memorized_log(017, 2026-07-09~)에서 나온다. */
export interface CompletionFacts {
  /**
   * 이 단어장의 단어를 실제로 외운 날의 수. 달력 일수(planStartedAt→planUpdatedAt)가
   * 아니다 — 그쪽은 쉰 날이 다 포함돼 "42일 걸림"처럼 노력이 아니라 방치를 자랑하게 된다.
   */
  studyDays: number;
  /** 마지막으로 외운 단어. 고른 이유가 분명한 한 개다. */
  lastTerm: string | null;
}

/**
 * 017 이전(2026-07-09)에 외운 단어는 로그가 없다 → 그때 완주한 단어장은
 * `{ studyDays: 0, lastTerm: null }`이 나오고, 상장은 그 줄들을 빼고 그린다.
 * 삭제된 단어는 제외한다(그날 상세와 같은 규칙).
 */
export async function getCompletionFacts(listId: string): Promise<CompletionFacts> {
  const db = await getDb();
  const [dayRow, lastRow] = await Promise.all([
    db.getFirstAsync<{ n: number }>(COMPLETION_DAYS_SQL, listId),
    db.getFirstAsync<{ term: string }>(COMPLETION_LAST_TERM_SQL, listId),
  ]);
  return { studyDays: dayRow?.n ?? 0, lastTerm: lastRow?.term ?? null };
}

/** 완주 기록 한 줄. 숫자는 완주 «그때»의 스냅숏이고, 제목만 살아 있는 단어장을 따라간다. */
export interface CompletionRecord {
  listId: string;
  /** 계획 시작 시각 — 이 계획 인스턴스의 신원(같은 단어장을 다시 완주하면 달라진다). */
  startedAt: number;
  completedAt: number;
  title: string;
  totalWords: number;
  studyDays: number;
  lastTerm: string | null;
  /** 단어장이 아직 살아 있는가. 지워졌으면 기록만 남고 열 곳이 없다. */
  listAlive: boolean;
}

/**
 * 단어장 하나가 지금 완주 상태면 기록한다.
 *
 * 부르는 자리는 둘이다: 계획이 하루 넘어가는 순간(`updatePlanProgress`)과, 근거가 지워지기
 * 직전(`clearPlan`). 앞의 것이 정상 경로이고 뒤의 것은 안전망이다 — 어느 쪽으로 와도 줄은
 * 하나다(PK 가 계획 인스턴스라 중복 삽입이 무시된다).
 */
export async function recordCompletion(listId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(COMPLETION_RECORD_SQL, listId);
}

/** 지금 완주 상태인데 줄이 없는 단어장을 채운다(앱 시작·클라우드 pull 직후). */
export async function backfillCompletions(): Promise<void> {
  const db = await getDb();
  await db.runAsync(COMPLETION_BACKFILL_SQL);
}

/** 완주 기록 전체(최신순). */
export async function getCompletions(): Promise<CompletionRecord[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(COMPLETION_LIST_SQL);
  return rows.map((r: any) => ({
    listId: r.listId,
    startedAt: r.startedAt ?? 0,
    completedAt: r.completedAt ?? 0,
    title: r.title ?? '',
    totalWords: r.totalWords ?? 0,
    studyDays: r.studyDays ?? 0,
    lastTerm: r.lastTerm ?? null,
    listAlive: (r.listAlive ?? 0) === 1,
  }));
}

/** 지금 걸려 있는 계획의 완주 기록. 없으면 null(아직 안 적혔거나 완주가 아니다). */
export async function getCompletionForPlan(
  listId: string, startedAt: number,
): Promise<{ totalWords: number; studyDays: number; lastTerm: string | null; completedAt: number } | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<any>(COMPLETION_FOR_PLAN_SQL, listId, startedAt);
  if (!row) return null;
  return {
    totalWords: row.totalWords ?? 0,
    studyDays: row.studyDays ?? 0,
    lastTerm: row.lastTerm ?? null,
    completedAt: row.completedAt ?? 0,
  };
}

/** 완주 기록 한 줄 요약. 내 학습의 진입 줄이 쓴다. */
export interface CompletionSummary { books: number; words: number; days: number }

export async function getCompletionSummary(): Promise<CompletionSummary> {
  const db = await getDb();
  const row = await db.getFirstAsync<CompletionSummary>(COMPLETION_SUMMARY_SQL);
  return { books: row?.books ?? 0, words: row?.words ?? 0, days: row?.days ?? 0 };
}
