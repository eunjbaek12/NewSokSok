import { shouldAsk, COOLDOWN_DAYS, MAX_ASKS, type ReviewState } from '../features/reviews/should-ask';

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
