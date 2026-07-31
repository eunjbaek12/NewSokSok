// Android 구독 오퍼 선택 (features/billing/offers.ts)
//
// Play는 (기본 요금제 × 혜택) 조합만큼 오퍼를 순서 보장 없이 내려준다. 예전 코드가
// `[0]`을 그대로 쓰던 동안, pro_yearly에 잘못 들어가 있던 **월 청구** 기본 요금제로
// 결제될 수 있었다(2026-07-27 발견, 실제 유료 결제 0건 상태라 피해 없음).

import { pickAndroidOffer, type AndroidOfferLike } from '@/features/billing/offers';

/** 가격이 0인 phase = 무료 체험 phase. */
function offer(
  basePlanId: string,
  opts: { token?: string; free?: boolean; price?: string } = {},
): AndroidOfferLike {
  const phases = [
    ...(opts.free ? [{ priceAmountMicros: '0' }] : []),
    { priceAmountMicros: opts.price ?? '36000000000' },
  ];
  return {
    basePlanId,
    offerToken: opts.token ?? `${basePlanId}-token`,
    pricingPhases: { pricingPhaseList: phases },
  };
}

describe('pickAndroidOffer', () => {
  it('basePlanId가 일치하는 오퍼를 고른다', () => {
    const offers = [offer('monthly'), offer('annual')];
    expect(pickAndroidOffer(offers, 'annual')?.basePlanId).toBe('annual');
    expect(pickAndroidOffer(offers, 'monthly')?.basePlanId).toBe('monthly');
  });

  it('실제 사고 시나리오 — 월 청구 요금제가 섞여 있어도 annual만 고른다', () => {
    // pro_yearly 안에 잘못된 `yearly`(매월 청구)가 먼저 오는 상황. [0]을 쓰면
    // 화면은 "연 ₩36,000"인데 월 단위로 갱신되는 요금제로 결제된다.
    const offers = [offer('yearly', { token: 'WRONG' }), offer('annual', { token: 'RIGHT' })];
    expect(pickAndroidOffer(offers, 'annual')?.offerToken).toBe('RIGHT');
  });

  it('일치하는 요금제가 없으면 null — 첫 번째로 폴백하지 않는다', () => {
    const offers = [offer('monthly'), offer('yearly')];
    expect(pickAndroidOffer(offers, 'annual')).toBeNull();
  });

  it('같은 요금제에 오퍼가 여럿이면 무료 체험이 붙은 쪽을 우선한다', () => {
    const offers = [
      offer('annual', { token: 'plain' }),
      offer('annual', { token: 'with-trial', free: true }),
    ];
    expect(pickAndroidOffer(offers, 'annual')?.offerToken).toBe('with-trial');
  });

  it('무료 체험 오퍼가 없으면 일치하는 첫 번째를 쓴다', () => {
    const offers = [offer('annual', { token: 'first' }), offer('annual', { token: 'second' })];
    expect(pickAndroidOffer(offers, 'annual')?.offerToken).toBe('first');
  });

  it('오퍼 목록이 비었거나 없으면 null', () => {
    expect(pickAndroidOffer([], 'annual')).toBeNull();
    expect(pickAndroidOffer(null, 'annual')).toBeNull();
    expect(pickAndroidOffer(undefined, 'annual')).toBeNull();
  });

  it('pricingPhases가 없어도 basePlanId만 맞으면 고른다', () => {
    // 체험 판정만 못 할 뿐, 요금제 선택 자체는 되어야 한다.
    const offers: AndroidOfferLike[] = [{ basePlanId: 'annual', offerToken: 'bare' }];
    expect(pickAndroidOffer(offers, 'annual')?.offerToken).toBe('bare');
  });
});
