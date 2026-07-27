// 가격 포맷·환산 순수 헬퍼 — plans.tsx 가격 표시 전용.
//
// 스토어가 내려준 숫자 가격(amount) + 통화코드(currency)로 월 환산·절약률을
// 런타임 계산한다. 하드코딩 통화 문자열(예: "월 ₩2,992")은 미국 등 다른
// 스토어프론트에서 CTA(실시간 $)와 통화가 어긋나는 버그를 만들었다.
//
// Intl.NumberFormat의 통화 포맷은 Hermes(Expo 54)에서 지원된다
// (https://docs.expo.dev/guides/localization 참고). 통화별 소수 자릿수도
// 자동 처리 — KRW는 정수(₩2,992), USD는 2자리($2.33).

export interface PriceDetail {
  /** 스토어 표시 문자열 (예: "$27.99", "₩35,900") */
  display: string;
  /** 숫자 금액 (예: 27.99) */
  amount: number;
  /** ISO 4217 통화 코드 (예: "USD", "KRW") */
  currency: string;
}

/**
 * amount를 통화 포맷 문자열로. Intl 미지원/잘못된 통화코드면 숫자만 반환(폴백).
 * Hermes에선 정상 동작하므로 폴백은 belt-and-suspenders.
 */
export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('default', { style: 'currency', currency }).format(amount);
  } catch {
    return String(Math.round(amount));
  }
}

/** 연간 가격의 월 환산 표시 문자열 (amount/12). */
export function monthlyEquivalent(yearly: PriceDetail): string {
  return formatMoney(yearly.amount / 12, yearly.currency);
}

/**
 * 연간 결제 절약률(%) = 1 - 연간/(월간×12). 통화 무관(같은 스토어프론트라 통화 동일).
 * 가격이 비정상이거나 연간이 더 비싸면 null.
 */
export function savingsPercent(monthly: PriceDetail, yearly: PriceDetail): number | null {
  if (monthly.amount <= 0 || yearly.amount <= 0) return null;
  const ratio = 1 - yearly.amount / (monthly.amount * 12);
  if (ratio <= 0) return null;
  return Math.round(ratio * 100);
}

/**
 * ISO 8601 기간(Play의 billingPeriod: "P7D"·"P1W"·"P1M")을 일수로. 파싱 실패 시 null.
 *
 * 체험 기간도 가격과 같은 원칙을 따른다 — 스토어 설정이 단일 출처다. "7일"을 앱에
 * 하드코딩하면 Play/ASC에서 오퍼 길이를 바꾸는 순간 앱 문구가 거짓이 된다.
 * 월/년은 캘린더 길이가 달라 근사값(30/365)이지만, 무료 체험은 일·주 단위라 실무상 정확하다.
 */
export function isoPeriodToDays(period: string): number | null {
  const m = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?$/.exec(period.trim());
  if (!m) return null;
  const [y, mo, w, d] = [m[1], m[2], m[3], m[4]].map((v) => (v ? Number(v) : 0));
  const days = y * 365 + mo * 30 + w * 7 + d;
  return days > 0 ? days : null;
}
