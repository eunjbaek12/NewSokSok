import {
  formatMoney,
  monthlyEquivalent,
  savingsPercent,
  isoPeriodToDays,
  type PriceDetail,
} from '@/features/billing/pricing';

const krwMonthly: PriceDetail = { display: '₩3,900', amount: 3900, currency: 'KRW' };
const krwYearly: PriceDetail = { display: '₩35,900', amount: 35900, currency: 'KRW' };
const usdMonthly: PriceDetail = { display: '$2.99', amount: 2.99, currency: 'USD' };
const usdYearly: PriceDetail = { display: '$27.99', amount: 27.99, currency: 'USD' };

describe('savingsPercent', () => {
  it('KRW 연간이 월×12 대비 약 23% 절약', () => {
    // 1 - 35900/(3900*12) = 1 - 35900/46800 = 0.2329 → 23
    expect(savingsPercent(krwMonthly, krwYearly)).toBe(23);
  });

  it('USD 연간이 월×12 대비 약 22% 절약', () => {
    // 1 - 27.99/(2.99*12) = 1 - 27.99/35.88 = 0.2199 → 22
    expect(savingsPercent(usdMonthly, usdYearly)).toBe(22);
  });

  it('연간이 더 비싸거나 같으면 null', () => {
    const m: PriceDetail = { display: '', amount: 1000, currency: 'KRW' };
    const y: PriceDetail = { display: '', amount: 12000, currency: 'KRW' };
    expect(savingsPercent(m, y)).toBeNull();
  });

  it('가격이 0/음수면 null', () => {
    const zero: PriceDetail = { display: '', amount: 0, currency: 'KRW' };
    expect(savingsPercent(zero, krwYearly)).toBeNull();
    expect(savingsPercent(krwMonthly, zero)).toBeNull();
  });
});

describe('monthlyEquivalent', () => {
  it('KRW는 소수점 없이 정수로 환산 (35900/12 ≈ 2992)', () => {
    // Intl KRW는 fraction 0자리 → 반올림 정수. 통화기호 ₩ 포함.
    const s = monthlyEquivalent(krwYearly);
    expect(s).toContain('2,992');
    expect(s).toMatch(/₩|KRW/);
  });

  it('USD는 소수 2자리로 환산 (27.99/12 ≈ 2.33)', () => {
    const s = monthlyEquivalent(usdYearly);
    expect(s).toContain('2.33');
  });
});

describe('isoPeriodToDays', () => {
  // Play는 무료 체험 기간을 billingPeriod(ISO 8601)로 내려준다. 이 값이 곧
  // 요금제 화면의 "N일 무료 체험" 문구가 되므로, 앱이 "7일"을 하드코딩하지 않는다.
  it('일·주 표기를 일수로 (무료 체험에서 실제로 쓰이는 형태)', () => {
    expect(isoPeriodToDays('P7D')).toBe(7);
    expect(isoPeriodToDays('P1W')).toBe(7);
    expect(isoPeriodToDays('P3D')).toBe(3);
    expect(isoPeriodToDays('P2W')).toBe(14);
  });

  it('월·년은 근사값(30/365)으로 환산', () => {
    expect(isoPeriodToDays('P1M')).toBe(30);
    expect(isoPeriodToDays('P1Y')).toBe(365);
  });

  it('복합 표기도 합산', () => {
    expect(isoPeriodToDays('P1M15D')).toBe(45);
  });

  it('공백은 허용하되 형식이 어긋나면 null', () => {
    expect(isoPeriodToDays(' P7D ')).toBe(7);
    expect(isoPeriodToDays('7D')).toBeNull();
    expect(isoPeriodToDays('')).toBeNull();
    expect(isoPeriodToDays('P')).toBeNull();
    expect(isoPeriodToDays('PT30M')).toBeNull(); // 시간 단위는 체험 기간이 아니다
  });

  it('0일은 체험이 없는 것과 같으므로 null', () => {
    expect(isoPeriodToDays('P0D')).toBeNull();
  });
});

describe('formatMoney', () => {
  it('통화코드에 맞는 기호로 포맷', () => {
    expect(formatMoney(3900, 'KRW')).toMatch(/₩|KRW/);
    expect(formatMoney(2.99, 'USD')).toContain('2.99');
  });

  it('잘못된 통화코드는 숫자만 폴백(throw 안 함)', () => {
    expect(() => formatMoney(100, 'NOTACURRENCY')).not.toThrow();
  });
});
