import { hasRewardViewsRemaining, isAiQuotaExhausted } from '@/features/quota/reward-eligibility';
import type { QuotaStatus } from '@/features/quota/store';

const status = (overrides: Partial<QuotaStatus> = {}): QuotaStatus => ({
  tier: 'free', used: 0, limit: 50, bonus: 0,
  trial_ends_at: null, pro_until: null, reset_at: new Date().toISOString(),
  ...overrides,
});

describe('isAiQuotaExhausted', () => {
  it('distinguishes a proactive benefit prompt from an actual quota block', () => {
    expect(isAiQuotaExhausted(status({ used: 12, limit: 50, bonus: 0 }))).toBe(false);
    expect(isAiQuotaExhausted(status({ used: 50, limit: 50, bonus: 0 }))).toBe(true);
    expect(isAiQuotaExhausted(status({ used: 60, limit: 50, bonus: 20 }))).toBe(false);
    expect(isAiQuotaExhausted(status({ used: 70, limit: 50, bonus: 20 }))).toBe(true);
  });
});

describe('hasRewardViewsRemaining', () => {
  it('does not treat a legacy or partially loaded status as exhausted', () => {
    expect(hasRewardViewsRemaining(status())).toBe(true);
  });

  it('allows free and guest users while their server-owned view count remains', () => {
    expect(hasRewardViewsRemaining(status({ reward_views: 1, reward_max_views: 2 }))).toBe(true);
    expect(hasRewardViewsRemaining(status({ tier: 'guest', reward_views: 0, reward_max_views: 1 }))).toBe(true);
  });

  it('blocks exhausted and Pro users', () => {
    expect(hasRewardViewsRemaining(status({ reward_views: 2, reward_max_views: 2 }))).toBe(false);
    expect(hasRewardViewsRemaining(status({ tier: 'pro', reward_views: 0, reward_max_views: 0 }))).toBe(false);
  });
});
