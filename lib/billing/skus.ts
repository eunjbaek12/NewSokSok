// Play 구독 상품 ID — Play Console에서 동일 ID로 등록 필요.
// 가격: 월 ₩3,900 / 연 ₩36,000 (월 환산 ₩3,000, 약 23% 할인). App Store는 연 ₩35,900 —
// 스토어마다 가격이 갈리므로 앱은 절대 하드코딩하지 않고 스토어 값을 읽는다.
// 7일 무료 체험도 스토어 오퍼로만 제공된다(Play: free-trial 혜택 / ASC: 소개 혜택 "첫 주 무료").
//
// EAS Secret으로 오버라이드 가능 (테스트 SKU와 분리 운영).

export const SKU_PRO_MONTHLY = process.env.EXPO_PUBLIC_PRO_MONTHLY_SKU || 'pro_monthly';
export const SKU_PRO_YEARLY = process.env.EXPO_PUBLIC_PRO_YEARLY_SKU || 'pro_yearly';

export const PRO_SKUS = [SKU_PRO_MONTHLY, SKU_PRO_YEARLY] as const;

export type ProSku = typeof SKU_PRO_MONTHLY | typeof SKU_PRO_YEARLY;

// Android 기본 요금제 ID (Play Console → 구독 → 기본 요금제).
//
// 상품 하나에 기본 요금제가 여러 개 붙을 수 있고, Play가 내려주는 오퍼 순서는
// 보장되지 않는다. 그래서 결제할 요금제를 ID로 명시한다.
//
// ⚠️ 2026-07-27까지 pro_yearly의 기본 요금제(`yearly`)가 **매월 청구**로 잘못
// 설정돼 있었다. 연간 상품인데 월 단위로 갱신되는 상태였고, 앱은 "연 ₩36,000"으로
// 표시하므로 그대로 결제됐다면 청구 주기가 화면과 어긋났다. Play는 기본 요금제
// 생성 후 결제 주기를 바꿀 수 없어 `annual`을 새로 만들고 옛 것을 비활성화했다.
// (실제 유료 결제 0건 상태에서 발견 — 피해 없음.)
//
// 테스트용 SKU를 쓸 때는 그쪽 기본 요금제 ID도 여기에 맞춰야 한다.
export const BASE_PLAN_PRO_MONTHLY = 'monthly';
export const BASE_PLAN_PRO_YEARLY = 'annual';

/** SKU에 대응하는 Android 기본 요금제 ID. iOS엔 이 개념이 없다. */
export function basePlanIdFor(sku: ProSku): string {
  return sku === SKU_PRO_YEARLY ? BASE_PLAN_PRO_YEARLY : BASE_PLAN_PRO_MONTHLY;
}

export function isProSku(id: string): id is ProSku {
  return PRO_SKUS.includes(id as ProSku);
}

export type PlanPeriod = 'monthly' | 'yearly';

/** 저장된 구독 상품 ID(play_product_id)로부터 결제 주기를 도출. 알 수 없으면 null. */
export function getPlanPeriod(productId: string | null | undefined): PlanPeriod | null {
  if (!productId) return null;
  if (productId === SKU_PRO_YEARLY) return 'yearly';
  if (productId === SKU_PRO_MONTHLY) return 'monthly';
  return null;
}
