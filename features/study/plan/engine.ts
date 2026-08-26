import { Word, VocaList, PlanStatus } from '@/lib/types';

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
 * 2. planCurrentDay past the last day (with a recorded study) → 'completed'
 * 3. Stale (7+ days idle) AND past the end date → 'overdue'
 * 4. Stale (7+ days idle) within the end date → 'inactive'
 * 5. Otherwise (recently active) → 'in-progress'
 *
 * 'overdue'/'inactive' are gated behind staleness on purpose: a plan the user is
 * actively studying (planUpdatedAt within the threshold) should read as
 * 'in-progress' even after its deadline passed. Otherwise computePlanStatus would
 * keep returning 'overdue' on every entry path (home card AND opening the plan
 * screen directly) until the whole plan is finished, leaving the card stuck on
 * "기간 만료" no matter how much the user studies. Resuming study (planUpdatedAt
 * → today) self-heals the status back to active.
 */
export function computePlanStatus(list: VocaList, _words: Word[], now: number): PlanStatus {
  if (!list.planStartedAt || !list.planTotalDays) {
    return 'none';
  }
  if (
    list.planUpdatedAt != null &&
    (list.planCurrentDay ?? 0) > list.planTotalDays
  ) {
    return 'completed';
  }
  const planEndDate = list.planStartedAt + list.planTotalDays * 86400000;
  const INACTIVE_THRESHOLD = 7 * 24 * 60 * 60 * 1000;
  const lastActivity = list.planUpdatedAt ?? list.planStartedAt;
  const isStale = lastActivity != null && now - lastActivity >= INACTIVE_THRESHOLD;
  if (isStale) {
    return now > planEndDate ? 'overdue' : 'inactive';
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
 *
 * NOTE: 이 함수는 "미암기가 하나라도 있으면 그 Day"라는 100% 기준이라,
 * 화면이 쓰는 50% 기준과 다르다. 잠금 해제 판정에 쓰지 말 것 —
 * 39/40에서 갇히는 부류가 새로 생긴다. 그 용도는 deriveUnlockedDay다.
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

/**
 * 한 Day를 "했다"고 보는 기준. 홈 카드의 evalDay와 같은 값을 쓴다 —
 * 두 곳에 0.5를 복제해 두면 한쪽만 바뀌어 조용히 갈라진다.
 */
export const DAY_DONE_MEMORIZED_RATIO = 0.5;

/**
 * 잠금 해제 기준 Day를 단어 상태에서 유도한다.
 *
 * planCurrentDay는 세션 완주(finishSession) 한 경로에서만 오르는 카운터다.
 * 예문 모드로 공부하거나 마지막 카드 직전에 나가면 그 Day를 다 외워도 영영
 * 오르지 않아, 화면이 "40/40 암기"와 "이전 Day를 먼저 완료하세요"를 동시에
 * 말하는 상태가 된다. 게다가 그 비율의 분모는 Day의 단어 수가 아니라 "이번
 * 세션에서 본 카드 수"라, 40개 중 10개만 보고 끝내면 25%만 외운 Day가 완료로
 * 처리되기도 한다. 양쪽 다 카운터가 단어와 별개로 산다는 한 가지 원인이다.
 *
 * 그래서 잠금만은 카운터가 아니라 단어에서 읽는다: 암기 비율이 기준에 못
 * 미치는 가장 낮은 Day가 곧 아직 해야 할 Day다. 어떤 모드로 외웠든, 중간에
 * 나갔든 상관없어진다.
 *
 * 반환값은 잠금 판정에만 쓸 것. computePlanStatus에 먹이면 완료 판정
 * (planCurrentDay > planTotalDays)이 저절로 참이 되어 계획이 끝나 버린다.
 */
export function deriveUnlockedDay(words: Word[]): number {
  const assigned = words.filter(w => w.assignedDay != null && w.assignedDay > 0);
  if (assigned.length === 0) return 1;

  const byDay = new Map<number, { total: number; memorized: number }>();
  for (const w of assigned) {
    const acc = byDay.get(w.assignedDay!) ?? { total: 0, memorized: 0 };
    acc.total += 1;
    if (w.isMemorized) acc.memorized += 1;
    byDay.set(w.assignedDay!, acc);
  }

  const days = Array.from(byDay.keys()).sort((a, b) => a - b);
  for (const day of days) {
    const { total, memorized } = byDay.get(day)!;
    if (memorized / total < DAY_DONE_MEMORIZED_RATIO) return day;
  }
  // 전부 기준을 넘었다 — 마지막 Day를 돌려 아무 Day도 잠기지 않게 한다.
  // 여기서 마지막+1을 돌리면 호출부가 완료로 오해할 여지를 남긴다.
  return days[days.length - 1];
}

/**
 * 그 Day의 학습이 잠겨 있는가.
 *
 * 규칙은 여기 한 곳에만 둔다 — 화면과 테스트가 각자 `viewingDay > ...`를 들고
 * 있으면 한쪽만 바뀌어도 테스트는 계속 통과한다.
 *
 * 기준은 두 값 중 큰 쪽이다:
 *  - planCurrentDay: 세션을 완주해야만 오르는 카운터
 *  - deriveUnlockedDay(words): 단어의 암기 상태에서 유도한 값
 * planCurrentDay는 MAX()로만 오르므로(features/vocab/db.ts:891) 이 조합은 열기만
 * 하고 절대 잠그지 않는다. 이미 진도가 나간 사람이 업데이트 후 새로 잠기는 회귀가
 * 원천 차단된다.
 */
export function isDayLocked(params: {
  planStatus: PlanStatus;
  viewingDay: number;
  planCurrentDay: number;
  words: Word[];
}): boolean {
  const { planStatus, viewingDay, planCurrentDay, words } = params;
  if (planStatus !== 'in-progress' && planStatus !== 'overdue' && planStatus !== 'inactive') {
    return false;
  }
  // 0 = 아직 초기화 전, -1 = 미배정 묶음. 둘 다 잠금 대상이 아니다.
  if (viewingDay <= 0) return false;
  return viewingDay > Math.max(planCurrentDay, deriveUnlockedDay(words));
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
    } else if (dayMemorized / dayTotal < DAY_DONE_MEMORIZED_RATIO) {
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
