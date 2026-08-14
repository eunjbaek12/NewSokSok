import type { QuotaStatus } from './store';

/** Missing counters mean an older/partially loaded server response, not exhaustion. */
export function hasRewardViewsRemaining(status: QuotaStatus | null | undefined): boolean {
  if (!status || status.tier === 'pro') return false;
  if (status.reward_max_views == null || status.reward_views == null) return true;
  return status.reward_views < status.reward_max_views;
}

export function isAiQuotaExhausted(status: QuotaStatus | null | undefined): boolean {
  if (!status) return false;
  return status.used >= status.limit + status.bonus;
}
