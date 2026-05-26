// ③ Edge Function: 구독 영수증 상태 판정 (verify-purchase/verify-logic.ts)
//
// Play Developer API 응답 → 인정/거부 판정의 순수 로직. now 를 주입해 시간
// 의존성을 고정한다. (전체 핸들러 + Play API mock 통합 테스트는 Deno 런타임에서
// supabase/functions/verify-purchase/index.test.ts 로 별도 수행 — README 참고.)

import {
  evaluateSubscription,
  type PlaySubscriptionV2Response,
} from '../supabase/functions/verify-purchase/verify-logic';

const NOW = new Date('2026-05-26T00:00:00Z').getTime();
const FUTURE = new Date('2026-06-26T00:00:00Z').toISOString();
const PAST = new Date('2026-05-01T00:00:00Z').toISOString();
const PRODUCT = 'pro_monthly';

function playData(over: Partial<PlaySubscriptionV2Response> = {}): PlaySubscriptionV2Response {
  return {
    subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
    lineItems: [{ productId: PRODUCT, expiryTime: FUTURE }],
    ...over,
  };
}

describe('evaluateSubscription — 인정 케이스', () => {
  it('ACTIVE + 상품 일치 + 미래 만료 → ok', () => {
    const r = evaluateSubscription(playData(), PRODUCT, NOW);
    expect(r).toEqual({ ok: true, expiryTime: FUTURE });
  });

  it('IN_GRACE_PERIOD 도 인정 (결제 실패 유예 기간)', () => {
    const r = evaluateSubscription(
      playData({ subscriptionState: 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD' }),
      PRODUCT,
      NOW,
    );
    expect(r.ok).toBe(true);
  });
});

describe('evaluateSubscription — 상태 거부', () => {
  it.each([
    'SUBSCRIPTION_STATE_CANCELED',
    'SUBSCRIPTION_STATE_EXPIRED',
    'SUBSCRIPTION_STATE_ON_HOLD',
    'SUBSCRIPTION_STATE_PAUSED',
  ])('비활성 상태 %s → 402 (detail=상태값)', (state) => {
    const r = evaluateSubscription(playData({ subscriptionState: state }), PRODUCT, NOW);
    expect(r).toEqual({ ok: false, status: 402, error: 'subscription_invalid', detail: state });
  });

  it('상태 누락 → 402 (detail 빈 문자열)', () => {
    const r = evaluateSubscription(playData({ subscriptionState: undefined }), PRODUCT, NOW);
    expect(r).toEqual({ ok: false, status: 402, error: 'subscription_invalid', detail: '' });
  });
});

describe('evaluateSubscription — 상품 불일치', () => {
  it('lineItems 에 요청 productId 없음 → product_mismatch', () => {
    const r = evaluateSubscription(
      playData({ lineItems: [{ productId: 'pro_yearly', expiryTime: FUTURE }] }),
      PRODUCT,
      NOW,
    );
    expect(r).toEqual({
      ok: false, status: 402, error: 'subscription_invalid', detail: 'product_mismatch',
    });
  });

  it('lineItems 자체가 비어있음 → product_mismatch', () => {
    const r = evaluateSubscription(playData({ lineItems: [] }), PRODUCT, NOW);
    expect((r as any).detail).toBe('product_mismatch');
  });

  it('lineItems 필드 누락 → product_mismatch', () => {
    const r = evaluateSubscription(playData({ lineItems: undefined }), PRODUCT, NOW);
    expect((r as any).detail).toBe('product_mismatch');
  });
});

describe('evaluateSubscription — 만료 검증', () => {
  it('만료 시각이 과거 → expired', () => {
    const r = evaluateSubscription(
      playData({ lineItems: [{ productId: PRODUCT, expiryTime: PAST }] }),
      PRODUCT,
      NOW,
    );
    expect((r as any).detail).toBe('expired');
  });

  it('만료 시각 누락 → expired', () => {
    const r = evaluateSubscription(
      playData({ lineItems: [{ productId: PRODUCT }] }),
      PRODUCT,
      NOW,
    );
    expect((r as any).detail).toBe('expired');
  });

  it('만료 시각이 정확히 now → expired (경계는 <=)', () => {
    const exact = new Date(NOW).toISOString();
    const r = evaluateSubscription(
      playData({ lineItems: [{ productId: PRODUCT, expiryTime: exact }] }),
      PRODUCT,
      NOW,
    );
    expect((r as any).detail).toBe('expired');
  });

  it('만료 시각이 now + 1ms → 인정', () => {
    const r = evaluateSubscription(
      playData({ lineItems: [{ productId: PRODUCT, expiryTime: new Date(NOW + 1).toISOString() }] }),
      PRODUCT,
      NOW,
    );
    expect(r.ok).toBe(true);
  });
});
