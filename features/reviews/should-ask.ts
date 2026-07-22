// 자동 인앱 리뷰 요청을 지금 호출해도 되는지 판정하는 순수 로직(저장·OS 호출과 분리
// → 테스트 가능, RN 의존 0). iOS/Android 자체가 네이티브 리뷰 팝업 표시를 강하게
// 억제하지만(연 3회 등), 우리도 호출을 아껴 나그를 원천 차단한다.

/** 인앱 리뷰 요청 상태(로컬 전용). lastAskedAt=0 → 요청한 적 없음. */
export interface ReviewState {
  lastAskedAt: number; // epoch ms
  askCount: number; // 지금까지 자동 요청한 횟수
}

/** 마지막 요청 후 이만큼 지나야 다시 자동 요청. */
export const COOLDOWN_DAYS = 120;
/** 평생 자동 요청 상한(이 이상은 절대 자동으로 안 물어봄). */
export const MAX_ASKS = 3;
/** 마일스톤이 없어도 자동 요청할 최소 누적 암기 단어 수(열정 신규 사용자 커버용). */
export const MEMORIZED_THRESHOLD = 20;
/**
 * 자동 요청할 최소 세션 정답률(%). 결과 화면이 이 선 아래를 "복습이 필요해요"로
 * 부르므로(studyResults.needsReviewMessage) 기준을 맞춘다 — 방금 많이 틀린 사람에게
 * 별점을 물으면 낮은 평점을 얻고, OS 연 3회 한도까지 태운다.
 */
export const MIN_ACCURACY_PERCENT = 50;

const DAY_MS = 24 * 60 * 60 * 1000;

export function shouldAsk(state: ReviewState, now: number): boolean {
  if (state.askCount >= MAX_ASKS) return false;
  if (state.lastAskedAt > 0 && now - state.lastAskedAt < COOLDOWN_DAYS * DAY_MS) return false;
  return true;
}

/**
 * 마일스톤 없는 세션에서 지금이 물어볼 만한 순간인지 — "충분히 몰입했고(누적 암기),
 * 이번 세션도 잘 됐는가(정답률)". 쓰로틀(shouldAsk)과 직교하며 그보다 먼저 걸러
 * 아까운 요청 기회를 나쁜 순간에 쓰지 않게 한다.
 */
export function isGoodMoment(accuracyPercent: number, totalMemorized: number): boolean {
  return accuracyPercent >= MIN_ACCURACY_PERCENT && totalMemorized >= MEMORIZED_THRESHOLD;
}
