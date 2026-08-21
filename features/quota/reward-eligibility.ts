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

/**
 * 오늘 더 볼 수 있는 광고 횟수. 모르면 null — hasRewardViewsRemaining 과 달리
 * "모른다"를 0/1 어느 쪽으로도 뭉개지 않는다.
 *
 * 🔑 문구가 "한 번 더 보면 +20단어" 처럼 **횟수를 말할 때**는 이 함수를 써야 한다.
 * hasRewardViewsRemaining 은 카운터가 없으면 true 를 주는데(옛 서버 응답을 막지 않으려고),
 * 그 true 를 "한 번 남았다"로 읽으면 못 받을 보상을 약속하게 된다.
 * 상한은 서버가 정한다(Free 2 · 게스트 1) — 앱에 숫자를 박지 말 것.
 */
export function rewardViewsLeft(status: QuotaStatus | null | undefined): number | null {
  if (!status || status.tier === 'pro') return 0;
  if (status.reward_max_views == null || status.reward_views == null) return null;
  return Math.max(0, status.reward_max_views - status.reward_views);
}

/**
 * 광고 1회당 받는 단어 수. 서버가 `reward_amount` 를 주면 그것이 정답이고,
 * 없을 때만 등급 기본값으로 떨어진다 — 이 숫자는 서버 정책(grant_rewarded_bonus)과
 * 같아야 하므로 화면마다 따로 적지 말 것.
 */
export function rewardAmountOf(status: QuotaStatus | null | undefined): number {
  return status?.reward_amount ?? (status?.tier === 'guest' ? 10 : 20);
}
