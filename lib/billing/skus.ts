// Play 구독 상품 ID — Play Console에서 동일 ID로 등록 필요.
// 가격: 월 ₩3,900 / 연 ₩36,000 (월 환산 ₩3,000, 약 23% 할인). 7일 무료 체험은 Play Console offer에서 설정.
//
// EAS Secret으로 오버라이드 가능 (테스트 SKU와 분리 운영).

export const SKU_PRO_MONTHLY = process.env.EXPO_PUBLIC_PRO_MONTHLY_SKU || 'pro_monthly';
export const SKU_PRO_YEARLY = process.env.EXPO_PUBLIC_PRO_YEARLY_SKU || 'pro_yearly';

export const PRO_SKUS = [SKU_PRO_MONTHLY, SKU_PRO_YEARLY] as const;

export type ProSku = typeof SKU_PRO_MONTHLY | typeof SKU_PRO_YEARLY;

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
