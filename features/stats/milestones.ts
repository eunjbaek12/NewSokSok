// 스트릭 마일스톤 축하 팝업(학습 결과 화면)의 순수 판정 로직.
// 저장(AsyncStorage)은 milestones-storage.ts, 표시는 MilestoneCelebration.tsx 몫.
//
// 핵심 규칙: "평생 최고 기록을 갱신할 때만 축하" (게임 도전과제 방식).
// 스트릭이 끊겼다 재도달해도 이미 받은 단계는 반복하지 않는다 — 반복 끊김 사용자에게
// 3·7일 팝업이 계속 뜨는 귀찮음을 구조적으로 차단하고, 성장 서사(신입생→교수님)와도
// 정합(한 번 우등생이 된 아보카도가 새내기로 돌아가지 않는다). 초기 런 기반 재축하
// 설계는 이 이유로 폐기(2026-07-12, 사용자 결정).

/** 축하 대상 연속 학습일. 새내기(3)→열공 학생(7)→우등생(30)→졸업(100)→교수님(365). */
export const STREAK_MILESTONES = [3, 7, 30, 100, 365] as const;
export type StreakMilestone = (typeof STREAK_MILESTONES)[number];

/**
 * 이번에 축하할 마일스톤. 현재 스트릭으로 도달한 최고 마일스톤이 지금까지 축하한
 * 최고 기록(maxCelebrated)을 넘어설 때만 그 하나를 반환 — 여러 단계를 건너뛰어도
 * 팝업은 1개(중도 이탈 소급·동기화 점프 포함), 이미 받은 단계는 영영 반복 없음.
 */
export function pickMilestone(streak: number, maxCelebrated: number): StreakMilestone | null {
  for (let i = STREAK_MILESTONES.length - 1; i >= 0; i--) {
    const m = STREAK_MILESTONES[i];
    if (streak >= m) return m > maxCelebrated ? m : null;
  }
  return null;
}
