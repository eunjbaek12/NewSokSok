import { dateStrToEpochDay } from './date';

/** study_days 한 행에 대응하는 순수 도메인 형태. */
export interface StudyDay {
  date: string; // 'YYYY-MM-DD'
  studiedCount: number;
  memorizedCount: number;
}

/**
 * 연속 학습일(스트릭). 오늘 또는 어제까지 이어진 연속 구간의 길이.
 *
 * 오늘 활동이 없어도 어제까지 이어졌으면 그 길이를 "살아있는" 스트릭으로 인정한다
 * (Duolingo와 동일 — 오늘 학습하면 +1 되고, 안 하면 어제까지의 길이가 유지되다가
 * 자정을 넘겨 이틀 비면 0으로 끊긴다).
 *
 * @param days 활동이 있는 날짜 목록(중복 허용, 정렬 무관)
 * @param today 기준 'YYYY-MM-DD'
 */
export function computeStreak(days: StudyDay[], today: string): number {
  if (days.length === 0) return 0;
  const present = new Set(days.map(d => dateStrToEpochDay(d.date)));
  const todayN = dateStrToEpochDay(today);

  // 스트릭 끝점: 오늘 활동이 있으면 오늘, 없으면 어제(있을 때). 둘 다 없으면 끊김.
  let end: number;
  if (present.has(todayN)) end = todayN;
  else if (present.has(todayN - 1)) end = todayN - 1;
  else return 0;

  let count = 0;
  for (let cur = end; present.has(cur); cur--) count++;
  return count;
}

/** 역대 최장 연속 학습일. */
export function computeLongestStreak(days: StudyDay[]): number {
  if (days.length === 0) return 0;
  const nums = Array.from(new Set(days.map(d => dateStrToEpochDay(d.date)))).sort((a, b) => a - b);
  let longest = 1;
  let run = 1;
  for (let i = 1; i < nums.length; i++) {
    run = nums[i] === nums[i - 1] + 1 ? run + 1 : 1;
    if (run > longest) longest = run;
  }
  return longest;
}

/** 조건을 만족하는 날짜의 studiedCount 합. (이번 주/이번 달 집계용) */
export function sumStudied(days: StudyDay[], predicate: (date: string) => boolean): number {
  return days.reduce((acc, d) => (predicate(d.date) ? acc + d.studiedCount : acc), 0);
}

/** 조건을 만족하는 날짜의 memorizedCount 합. (오늘/이번 주 외운 단어 타일용) */
export function sumMemorized(days: StudyDay[], predicate: (date: string) => boolean): number {
  return days.reduce((acc, d) => (predicate(d.date) ? acc + d.memorizedCount : acc), 0);
}
