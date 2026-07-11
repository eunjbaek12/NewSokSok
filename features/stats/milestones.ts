import { addDaysStr } from './date';

// 스트릭 마일스톤 축하 팝업(학습 결과 화면)의 순수 판정 로직.
// 저장(AsyncStorage)은 milestones-storage.ts, 표시는 MilestoneCelebration.tsx 몫.
//
// 핵심 규칙: "같은 스트릭 런(run)에서는 마일스톤당 1회만 축하".
// 런은 시작일('YYYY-MM-DD')로 식별한다 — 스트릭이 끊겼다 다시 도달하면 시작일이
// 달라지므로 자연스럽게 재축하되고, 이어지는 런에서는 절대 반복되지 않는다.

/** 축하 대상 연속 학습일. 새내기(3)→열공 학생(7)→우등생(30)→졸업(100)→교수님(365). */
export const STREAK_MILESTONES = [3, 7, 30, 100, 365] as const;
export type StreakMilestone = (typeof STREAK_MILESTONES)[number];

/** milestone(문자열 키) → 그 마일스톤을 축하한 스트릭 런의 시작일 'YYYY-MM-DD'. */
export type CelebratedMap = Partial<Record<string, string>>;

/** 현재 스트릭 런의 시작일. streak ≥ 1 가정(0이면 호출 자체가 무의미). */
export function runStartDate(streak: number, today: string): string {
  return addDaysStr(today, -(streak - 1));
}

/**
 * 이번에 축하할 마일스톤. 도달한 것 중 최고 하나만 — 중도 이탈로 놓친 날이 있어도
 * 다음 완주 때 소급되고(예: 스트릭 9일에 7 미축하면 7 반환), 동기화로 스트릭이
 * 점프해도 팝업은 1개다. 이미 이 런에서 축하했으면 null.
 */
export function pickMilestone(
  streak: number,
  celebrated: CelebratedMap,
  today: string,
): StreakMilestone | null {
  const runStart = runStartDate(streak, today);
  for (let i = STREAK_MILESTONES.length - 1; i >= 0; i--) {
    const m = STREAK_MILESTONES[i];
    if (streak < m) continue;
    // 최고 도달 마일스톤 하나만 판정 — 이보다 낮은 것은 markCelebrated가 함께
    // 마킹하므로(아래) 나중에 "30일 축하 후 7일 축하" 같은 역행이 없다.
    return celebrated[String(m)] === runStart ? null : m;
  }
  return null;
}

/**
 * 축하 직전 호출 — 도달한 모든 마일스톤을 현재 런으로 마킹한 새 맵을 돌려준다.
 * 최고만이 아니라 전부 마킹하는 이유: 소급 축하는 "가장 높은 것 1회"로 끝내고,
 * 같은 런에서 하위 마일스톤이 뒤늦게 다시 뜨는 일을 막기 위함.
 */
export function markCelebrated(
  celebrated: CelebratedMap,
  streak: number,
  today: string,
): CelebratedMap {
  const runStart = runStartDate(streak, today);
  const next: CelebratedMap = { ...celebrated };
  for (const m of STREAK_MILESTONES) {
    if (streak >= m) next[String(m)] = runStart;
  }
  return next;
}
