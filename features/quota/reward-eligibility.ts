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

/**
 * 지금 더 쓸 수 있는 단어 수. 모르면 null — "모른다"와 "0"은 다르다
 * (status가 아직 안 온 상태에서 0으로 읽으면 멀쩡한 사용자를 막는다).
 *
 * ⚠️ Pro는 일일·월간 중 **더 빡빡한 쪽**이 실제 잔량이다. 두 한도가 3,000으로
 * 같아서 일일만 보면 월말에 잔량을 크게 오판한다 — 이번 달 2,990을 쓰고 오늘
 * 아직 안 썼으면 일일 기준으로는 3,000이 남은 것처럼 보이지만 실제로는 10이다.
 */
export function getQuotaLeft(status: QuotaStatus | null | undefined): number | null {
  if (!status) return null;
  const daily = Math.max(0, status.limit + (status.bonus ?? 0) - status.used);
  if (status.tier !== 'pro') return daily;
  if (status.month_limit == null || status.month_used == null) return daily;
  return Math.min(daily, Math.max(0, status.month_limit - status.month_used));
}
