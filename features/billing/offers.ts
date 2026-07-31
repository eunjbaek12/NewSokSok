// Android 구독 오퍼 선택 — 순수 로직.
//
// Play는 상품 하나에 대해 (기본 요금제 × 혜택) 조합만큼 오퍼를 내려주고, 그 순서는
// 보장하지 않는다. 예전 코드는 `[0]`을 그대로 썼는데, pro_yearly에 **월 청구** 기본
// 요금제가 잘못 들어가 있던 동안(2026-07-27 발견) 화면은 "연 ₩36,000"이면서 월 단위로
// 갱신되는 요금제로 결제될 수 있었다. 그래서 basePlanId로 명시 선택한다.

/**
 * expo-iap의 `ProductSubscriptionAndroidOfferDetails` 중 선택에 필요한 필드만 추린 구조.
 * 구조적 타이핑이라 실제 스토어 객체를 그대로 받으면서, 테스트 픽스처는 가볍게 유지된다.
 */
export interface AndroidOfferLike {
  basePlanId: string;
  offerToken?: string;
  pricingPhases?: {
    pricingPhaseList?: { priceAmountMicros: string }[];
  } | null;
}

/**
 * `basePlanId`가 일치하는 오퍼를 고른다. 같은 요금제에 오퍼가 여러 개면(체험·할인)
 * **무료 체험이 붙은 쪽을 우선**한다.
 *
 * 일치하는 요금제가 없으면 null — 호출부는 폴백하지 말고 실패시켜야 한다.
 * 엉뚱한 주기·금액으로 결제되는 것보다 결제가 안 되는 편이 낫다.
 */
export function pickAndroidOffer<T extends AndroidOfferLike>(
  offers: T[] | null | undefined,
  basePlanId: string,
): T | null {
  if (!offers?.length) return null;

  const matching = offers.filter((o) => o.basePlanId === basePlanId);
  if (!matching.length) return null;

  return (
    matching.find((o) =>
      o.pricingPhases?.pricingPhaseList?.some((p) => p.priceAmountMicros === '0'),
    ) ?? matching[0]
  );
}
