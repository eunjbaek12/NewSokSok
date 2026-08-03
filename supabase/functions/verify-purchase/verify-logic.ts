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
  /**
   * 구매 시작 때 넘긴 obfuscatedAccountId를 Play가 그대로 담아 돌려준다.
   * 앱이 요청 본문에 실어 보낸 값이 아니라 **Play가 확인해 준 값**이라 위조할 수
   * 없다 — 그래서 소유권 판정에 쓸 수 있다. 각인 이전에 결제된 구독에는 없다.
   */
  externalAccountIdentifiers?: {
    obfuscatedExternalAccountId?: string;
    obfuscatedExternalProfileId?: string;
    externalAccountId?: string;
  };
  // 그 외 필드 다수 — 검증엔 위 네 가지만 사용
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

// ─── Apple (App Store Server API) ──────────────────────────────────────────

/** App Store Server API `signedTransactionInfo` payload (디코딩된 형태). */
export interface AppleTransactionPayload {
  bundleId?: string;
  productId?: string;
  transactionId?: string;
  originalTransactionId?: string;
  expiresDate?: number;       // epoch ms
  revocationDate?: number;    // epoch ms — 환불 시
  type?: string;              // "Auto-Renewable Subscription"
  inAppOwnershipType?: string;
  /**
   * 구매 시작 때 넘긴 appAccountToken(UUID)을 Apple이 서명된 payload에 담아
   * 돌려준다. 서명된 값이라 위조할 수 없어 소유권 판정에 쓸 수 있다.
   * 각인 이전에 결제된 구독에는 없다.
   */
  appAccountToken?: string;
}

/**
 * Apple 구독 transaction을 검증한다.
 *   - bundleId 일치 (앱 위변조 방지)
 *   - 요청 productId 와 일치
 *   - 환불 안 됨 (revocationDate 없음)
 *   - expiresDate > now
 *
 * Android와 동일한 형태로 반환 — 호출부 분기 없이 동일 응답 셰이프.
 */
export function evaluateAppleSubscription(
  payload: AppleTransactionPayload,
  productId: string,
  expectedBundleId: string,
  now: number = Date.now(),
): SubscriptionEvaluation {
  if (!payload.bundleId || payload.bundleId !== expectedBundleId) {
    return { ok: false, status: 402, error: 'subscription_invalid', detail: 'bundle_mismatch' };
  }
  if (!payload.productId || payload.productId !== productId) {
    return { ok: false, status: 402, error: 'subscription_invalid', detail: 'product_mismatch' };
  }
  if (payload.revocationDate && payload.revocationDate > 0) {
    return { ok: false, status: 402, error: 'subscription_invalid', detail: 'revoked' };
  }
  if (!payload.expiresDate || payload.expiresDate <= now) {
    return { ok: false, status: 402, error: 'subscription_invalid', detail: 'expired' };
  }
  // Android의 expiryTime은 ISOString이므로 일관성 위해 변환.
  const expiryIso = new Date(payload.expiresDate).toISOString();
  return { ok: true, expiryTime: expiryIso };
}
