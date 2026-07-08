import { getDb } from '@/lib/db';
import { todayStr, startOfWeekStr, monthPrefix } from './date';
import { computeStreak, computeLongestStreak, sumStudied, type StudyDay } from './streak';

/**
 * 오늘 행을 UPSERT. studied/memorized 델타를 누적한다. 단일 문장이라 트랜잭션 불필요
 * — 절대 호출자의 트랜잭션 안에서 부르지 말 것(중첩 트랜잭션 크래시). 항상 트랜잭션
 * 커밋 이후에 호출한다.
 */
async function upsertToday(studiedDelta: number, memorizedDelta: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO study_days (date, studiedCount, memorizedCount, updatedAt)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       studiedCount   = studiedCount + excluded.studiedCount,
       memorizedCount = memorizedCount + excluded.memorizedCount,
       updatedAt      = excluded.updatedAt`,
    todayStr(), studiedDelta, memorizedDelta, Date.now()
  );
}

/** 학습 세션 완료 기록(복습한 단어 수). 오늘을 '학습일'로 마킹. */
export async function recordStudySession(studiedCount: number): Promise<void> {
  if (studiedCount <= 0) return;
  await upsertToday(studiedCount, 0);
}

/** 새로 외운 단어 기록(미암기→암기 전환분). 오늘을 '학습일'로 마킹. */
export async function recordMemorized(count: number): Promise<void> {
  if (count <= 0) return;
  await upsertToday(0, count);
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
  totalMemorized: number;
  weekStudied: number;
  monthStudied: number;
  totalDays: number;
  days: StudyDay[];
}

export async function getStatsSummary(): Promise<StatsSummary> {
  const [days, totalMemorized] = await Promise.all([getAllStudyDays(), getMemorizedTotal()]);
  const today = todayStr();
  const weekStart = startOfWeekStr();
  const mPrefix = monthPrefix();
  return {
    currentStreak: computeStreak(days, today),
    longestStreak: computeLongestStreak(days),
    totalMemorized,
    weekStudied: sumStudied(days, d => d >= weekStart),
    monthStudied: sumStudied(days, d => d.startsWith(mPrefix)),
    totalDays: days.length,
    days,
  };
}
