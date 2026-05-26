// 구독 영수증 검증의 순수 판정 로직.
//
// Play Developer API(subscriptionsv2) 응답을 받아 "인정/거부 + 사유"를 결정한다.
// 외부 의존(fetch / supabase / Deno) 이 전혀 없는 순수 함수라 Deno 없이 Jest 로도
// 그대로 테스트할 수 있다. index.ts(핸들러)와 __tests__ 가 이 모듈을 공유한다.

export const VALID_SUBSCRIPTION_STATES = new Set([
  'SUBSCRIPTION_STATE_ACTIVE',
  'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
]);

export interface PlaySubscriptionV2Response {
  subscriptionState?: string;
  lineItems?: Array<{
    productId: string;
    expiryTime?: string;
    autoRenewingPlan?: { autoRenewEnabled?: boolean };
  }>;
  // 그 외 필드 다수 — 검증엔 아래 세 가지(state, productId, expiryTime)만 사용
}

export type SubscriptionEvaluation =
  | { ok: true; expiryTime: string }
  | { ok: false; status: number; error: string; detail: string };

/**
 * Play 구독 상태를 검증한다.
 *   - SUBSCRIPTION_STATE_ACTIVE | IN_GRACE_PERIOD 만 인정 (그 외는 취소·만료·보류)
 *   - 요청 productId 와 일치하는 lineItem 이 있어야 함
 *   - expiryTime 이 now 이후여야 함
 *
 * @param now epoch ms. 테스트에서 시간 의존성을 고정하기 위해 주입 가능. 기본값은 호출 시각.
 */
export function evaluateSubscription(
  playData: PlaySubscriptionV2Response,
  productId: string,
  now: number = Date.now(),
): SubscriptionEvaluation {
  const state = playData.subscriptionState ?? '';
  if (!VALID_SUBSCRIPTION_STATES.has(state)) {
    return { ok: false, status: 402, error: 'subscription_invalid', detail: state };
  }

  const lineItem = (playData.lineItems ?? []).find((li) => li.productId === productId);
  if (!lineItem) {
    return { ok: false, status: 402, error: 'subscription_invalid', detail: 'product_mismatch' };
  }

  const expiryTime = lineItem.expiryTime;
  if (!expiryTime || new Date(expiryTime).getTime() <= now) {
    return { ok: false, status: 402, error: 'subscription_invalid', detail: 'expired' };
  }

  return { ok: true, expiryTime };
}
