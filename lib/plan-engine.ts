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
  if (words.length > 0 && words.every(w => w.isMemorized)) {
    return 'completed';
  }
  const planEndDate = list.planStartedAt + list.planTotalDays * 86400000;
  if (now > planEndDate) {
    return 'overdue';
  }
  const INACTIVE_THRESHOLD = 7 * 24 * 60 * 60 * 1000;
  if (list.planUpdatedAt && now - list.planUpdatedAt >= INACTIVE_THRESHOLD) {
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
  return sortedDays[sortedDays.length - 1];
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
