import { Word, VocaList, PlanStatus } from './types';

export interface DayAssignment {
  wordId: string;
  day: number;
}

export interface PlanGenerationResult {
  assignments: DayAssignment[];
  totalDays: number;
}

export interface DaySection {
  day: number;
  data: Word[];
}

/**
 * Distributes all words across days 1..N evenly.
 * Words are assigned in their current array order.
 */
export function generatePlan(words: Word[], wordsPerDay: number): PlanGenerationResult {
  if (words.length === 0 || wordsPerDay <= 0) {
    return { assignments: [], totalDays: 0 };
  }
  const assignments: DayAssignment[] = words.map((word, index) => ({
    wordId: word.id,
    day: Math.floor(index / wordsPerDay) + 1,
  }));
  const totalDays = Math.ceil(words.length / wordsPerDay);
  return { assignments, totalDays };
}

/**
 * Re-distributes only unmemorized words starting from day 1.
 * Used when the user resets or rechunks the plan mid-progress.
 */
export function rechunkPlan(words: Word[], wordsPerDay: number): PlanGenerationResult {
  const unmemorized = words.filter(w => !w.isMemorized);
  return generatePlan(unmemorized, wordsPerDay);
}

/**
 * Derives the current plan status from list metadata and word state.
 * Evaluation priority:
 * 1. No planStartedAt → 'none'
 * 2. All words memorized → 'completed'
 * 3. Plan end date passed with unmemorized words → 'overdue'
 * 4. 7+ days since planUpdatedAt → 'inactive'
 * 5. Otherwise → 'in-progress'
 */
export function computePlanStatus(list: VocaList, words: Word[], now: number): PlanStatus {
  if (!list.planStartedAt || !list.planTotalDays) {
    return 'none';
  }
  if (
    list.planUpdatedAt != null &&
    (list.planCurrentDay ?? 0) > list.planTotalDays
  ) {
    return 'completed';
  }
  const planWords = words.filter(w => w.assignedDay != null && w.assignedDay > 0);
  const planEndDate = list.planStartedAt + list.planTotalDays * 86400000;
  if (now > planEndDate) {
    return 'overdue';
  }
  const INACTIVE_THRESHOLD = 7 * 24 * 60 * 60 * 1000;
  const lastActivity = list.planUpdatedAt ?? list.planStartedAt;
  if (lastActivity && now - lastActivity >= INACTIVE_THRESHOLD) {
    return 'inactive';
  }
  return 'in-progress';
}

/**
 * Suggests a words-per-day value for a 2-week plan.
 */
export function suggestWordsPerDay(totalWords: number): number {
  return Math.max(1, Math.ceil(totalWords / 14));
}

/**
 * Computes the current day the user should study.
 * Returns the lowest day number that still has unmemorized words.
 * If all assigned words are memorized, returns the last day.
 * If no words are assigned, returns 1.
 */
export function computeCurrentDay(words: Word[]): number {
  const assignedWords = words.filter(w => w.assignedDay != null && w.assignedDay > 0);
  if (assignedWords.length === 0) return 1;

  const daySet = new Set(assignedWords.map(w => w.assignedDay!));
  const sortedDays = Array.from(daySet).sort((a, b) => a - b);

  for (const day of sortedDays) {
    const dayWords = assignedWords.filter(w => w.assignedDay === day);
    if (dayWords.some(w => !w.isMemorized)) return day;
  }
  return sortedDays[0]; // 모두 암기됨 → Day 1(첫날)부터 복습
}

export type StudyState = 'needs-study' | 'studying' | 'completed';

export interface DayStudyStatus {
  displayDay: number;
  state: StudyState;
  dayMemorized: number;
  dayTotal: number;
}

function isSameCalendarDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

/**
 * Computes the study status for a plan card on the home screen.
 * - displayDay: the Day number to show on the chip
 * - state: 'needs-study' | 'studying' | 'completed'
 * - dayMemorized/dayTotal: word counts for the display day
 *
 * planCurrentDay semantics: "next day to study" (= last-studied day + 1).
 * Default value 1 means no day has been explicitly studied through the plan yet.
 *
 * 'completed' is returned only when the user finished the LAST day today.
 * After completing any other day, immediately shows the next day as 'needs-study'.
 */
export function computeDayStudyStatus(list: VocaList, words: Word[], now: number = Date.now()): DayStudyStatus {
  const isStudiedToday =
    list.planUpdatedAt != null && isSameCalendarDay(list.planUpdatedAt, now);

  const planCurrentDay = list.planCurrentDay ?? 1;
  const planTotalDays = list.planTotalDays ?? 0;

  function evalDay(day: number): { state: StudyState; dayMemorized: number; dayTotal: number } {
    const dayWords = words.filter(w => w.assignedDay === day);
    const dayTotal = dayWords.length;
    const dayMemorized = dayWords.filter(w => w.isMemorized).length;
    let state: StudyState;
    if (dayTotal === 0 || dayMemorized === 0) {
      state = 'needs-study';
    } else if (dayMemorized / dayTotal < 0.5) {
      state = 'studying';
    } else {
      state = 'completed';
    }
    return { state, dayMemorized, dayTotal };
  }

  if (isStudiedToday && planCurrentDay > 1) {
    // User studied today — always show "오늘 달성" for the last studied day.
    // Additional study beyond today's goal keeps the achieved status.
    const studiedDay = planCurrentDay - 1;
    const prev = evalDay(studiedDay);
    return { displayDay: studiedDay, state: 'completed', dayMemorized: prev.dayMemorized, dayTotal: prev.dayTotal };
  }

  if (isStudiedToday) {
    // Studied today but planCurrentDay is still 1 (edge case fallback)
    const { state, dayMemorized, dayTotal } = evalDay(1);
    return { displayDay: 1, state, dayMemorized, dayTotal };
  }

  // Not studied today:
  if (planCurrentDay > 1) {
    // Previously studied through the plan — resume at planCurrentDay
    const day = planTotalDays > 0 ? Math.min(planCurrentDay, planTotalDays) : planCurrentDay;
    const { dayMemorized, dayTotal } = evalDay(day);
    return { displayDay: day, state: 'needs-study', dayMemorized, dayTotal };
  }

  // planCurrentDay = 1: fresh start or reset plan — no study session has completed yet.
  // Always show Day 1 as 'needs-study'; do not infer completion from isMemorized state.
  const { dayMemorized, dayTotal } = evalDay(1);
  return { displayDay: 1, state: 'needs-study', dayMemorized, dayTotal };
}

/**
 * Groups words into sections by assignedDay for SectionList rendering.
 * Words with no assignedDay go into a day=0 bucket.
 */
export function groupWordsByDay(words: Word[]): DaySection[] {
  const map = new Map<number, Word[]>();
  const unassigned: Word[] = [];

  for (const word of words) {
    if (word.assignedDay == null) {
      unassigned.push(word);
    } else {
      if (!map.has(word.assignedDay)) map.set(word.assignedDay, []);
      map.get(word.assignedDay)!.push(word);
    }
  }

  const sections: DaySection[] = [];
  const sortedDays = Array.from(map.keys()).sort((a, b) => a - b);
  for (const day of sortedDays) {
    sections.push({ day, data: map.get(day)! });
  }
  if (unassigned.length > 0) {
    sections.push({ day: 0, data: unassigned });
  }
  return sections;
}
