import {
  shouldAsk,
  isGoodMoment,
  COOLDOWN_DAYS,
  MAX_ASKS,
  MEMORIZED_THRESHOLD,
  MIN_ACCURACY_PERCENT,
  type ReviewState,
} from '../features/reviews/should-ask';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = 1_700_000_000_000; // 고정 기준 시각(테스트 결정성)

describe('shouldAsk (자동 리뷰 요청 쓰로틀)', () => {
  it('요청한 적 없는 신규 상태 → 허용', () => {
    expect(shouldAsk({ lastAskedAt: 0, askCount: 0 }, NOW)).toBe(true);
  });

  it('평생 상한(MAX_ASKS) 도달 시 → 거부 (쿨다운 지났어도)', () => {
    const state: ReviewState = { lastAskedAt: NOW - (COOLDOWN_DAYS + 10) * DAY_MS, askCount: MAX_ASKS };
    expect(shouldAsk(state, NOW)).toBe(false);
  });

  it('쿨다운 이내 재요청 → 거부', () => {
    const state: ReviewState = { lastAskedAt: NOW - (COOLDOWN_DAYS - 1) * DAY_MS, askCount: 1 };
    expect(shouldAsk(state, NOW)).toBe(false);
  });

  it('쿨다운 경과 + 상한 미만 → 허용', () => {
    const state: ReviewState = { lastAskedAt: NOW - (COOLDOWN_DAYS + 1) * DAY_MS, askCount: 1 };
    expect(shouldAsk(state, NOW)).toBe(true);
  });

  it('쿨다운 경계값(정확히 COOLDOWN_DAYS 경과) → 허용 (엄격한 < 비교라 경계 포함)', () => {
    const state: ReviewState = { lastAskedAt: NOW - COOLDOWN_DAYS * DAY_MS, askCount: 1 };
    expect(shouldAsk(state, NOW)).toBe(true);
  });

  it('상한 직전(MAX_ASKS-1)이고 쿨다운 지났으면 마지막 한 번 허용', () => {
    const state: ReviewState = { lastAskedAt: NOW - (COOLDOWN_DAYS + 1) * DAY_MS, askCount: MAX_ASKS - 1 };
    expect(shouldAsk(state, NOW)).toBe(true);
  });
});

describe('isGoodMoment (마일스톤 없는 세션의 순간 적합성)', () => {
  it('몰입도·정답률 둘 다 충족 → 허용', () => {
    expect(isGoodMoment(100, MEMORIZED_THRESHOLD)).toBe(true);
  });

  it('많이 틀린 세션은 누적 암기가 충분해도 거부 (나쁜 순간에 기회를 쓰지 않는다)', () => {
    expect(isGoodMoment(MIN_ACCURACY_PERCENT - 1, MEMORIZED_THRESHOLD * 10)).toBe(false);
  });

  it('정답률이 좋아도 누적 암기가 임계 미만이면 거부 (아직 몰입 전)', () => {
    expect(isGoodMoment(100, MEMORIZED_THRESHOLD - 1)).toBe(false);
  });

  it('정답률 경계값(정확히 MIN_ACCURACY_PERCENT) → 허용', () => {
    expect(isGoodMoment(MIN_ACCURACY_PERCENT, MEMORIZED_THRESHOLD)).toBe(true);
  });

  it('한 문제도 못 맞힌 세션 → 거부', () => {
    expect(isGoodMoment(0, MEMORIZED_THRESHOLD * 5)).toBe(false);
  });
});
