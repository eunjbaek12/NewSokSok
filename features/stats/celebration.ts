/**
 * 학습을 마친 순간 «무엇을 축하할까»의 판정. 완주(022·023)와 스트릭 마일스톤은 같은
 * 세션에 겹칠 수 있어 순서를 정하는 규칙이 필요한데, 그 규칙이 화면의 `useEffect` 안에
 * 있으면 테스트가 닿지 못한다.
 *
 * 🔴 실제로 그래서 못 잡혔다 — 겹침 분기는 검증 기기의 스트릭이 0일이라 실기에서도
 * **실행조차 되지 않았고**, 완주 테스트 9개는 전부 SQL·마이그레이션이라 이 판단을 지나쳤다.
 * 순수 함수로 빼면 겹침이 표로 고정된다.
 *
 * RN·expo 를 import 하지 않는다(`completion.ts` 와 같은 이유).
 */

import { pickMilestone, type StreakMilestone } from './milestones';

export type CelebrationShow =
  | { kind: 'completion' }
  | { kind: 'milestone'; milestone: StreakMilestone };

export interface CelebrationPlan {
  /**
   * 완주 기록에 `celebratedAt` 을 찍을 것인가. **공개 플래그와 무관하게, 완주가 걸려
   * 있으면 언제나 찍는다** — 찍지 않고 넘기면 플래그를 켜는 날 그 사이의 완주가
   * 한꺼번에 «지금 막 일어난 일»로 되살아난다.
   */
  markCompletion: boolean;
  /** 무엇을 띄울 것인가. `null` 이면 축하 없이 지나간다(리뷰 요청을 시도할 자리). */
  show: CelebrationShow | null;
}

/**
 * 🔴 **완주가 스트릭 마일스톤을 이긴다.** 겹치면 완주만 띄우고 마일스톤은 **판정도
 * 소모(`saveMaxCelebrated`)도 하지 않는다** — 그래야 사라지지 않는다. `pickMilestone` 은
 * 「지금 스트릭으로 도달한 최고 단계」를 매번 다시 계산하고(마일스톤을 소모하지 않는다),
 * `maxCelebrated` 를 올리는 곳은 호출부의 `saveMaxCelebrated` 한 줄뿐이라, 건너뛴
 * 마일스톤은 **다음 학습 세션에 그대로 다시 온다**(같은 날 두 번째 세션이면 몇 분 뒤).
 *
 * 축하 팝업 둘을 연달아 띄우면 닫기가 세 번이 되고, 그 피로 위에서 리뷰 요청 기회
 * (OS 연 3회)까지 쓰게 된다.
 *
 * 🚩 `completionEnabled` 가 꺼져 있으면 완주는 **띄우지 않되 마킹만 하고 마일스톤으로
 * 흘려보낸다.** 여기서 멈춰 버리면 플래그가 닫힌 동안 마일스톤까지 함께 사라진다 —
 * 사용자에게는 완주도 마일스톤도 없는 세션이 된다.
 */
export function pickCelebration(
  hasPendingCompletion: boolean,
  streak: number,
  maxCelebrated: number,
  completionEnabled: boolean,
): CelebrationPlan {
  if (hasPendingCompletion && completionEnabled) {
    return { markCompletion: true, show: { kind: 'completion' } };
  }
  const m = pickMilestone(streak, maxCelebrated);
  return {
    markCompletion: hasPendingCompletion,
    show: m ? { kind: 'milestone', milestone: m } : null,
  };
}
