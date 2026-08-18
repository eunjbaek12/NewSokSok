import { hasRewardViewsRemaining, isAiQuotaExhausted, rewardViewsLeft } from './reward-eligibility';
import type { QuotaStatus } from './store';

/**
 * 보상형 광고 모달이 무엇을 보여줄지 한 번에 고른다.
 *
 * 🔴 이 함수가 생긴 이유: 예전에는 제목·본문·버튼이 각자 판정을 다시 계산했고,
 * 그중 **제목만 광고 소진(exhausted) 분기를 빠뜨렸다**. 그래서 광고를 2회 다 본
 * 사용자에게 "광고 보고 혜택 받기"라는 제목 아래 "광고를 다 봤어요" 본문과
 * "Pro 업그레이드" 버튼이 함께 나왔다(실측 2026-08-17). 판정을 여기 한 곳에 모아
 * 두면 다음에 상태가 하나 늘어도 세 곳을 따로 고칠 일이 없다.
 *
 * 축이 서로 다르다는 점이 핵심이다:
 * - 제목  = 무엇이 막혔나 (단어 잔량)
 * - 본문  = 왜 광고로 못 푸나 (광고 시청 횟수)
 * - 버튼  = 그럼 무엇을 (광고 / Pro)
 */
export type RewardedCopy = {
  titleKey: string;
  bodyKey: string;
  cta: 'watch' | 'pro' | 'none';
  icon: 'play-circle' | 'sparkles';
};

export function pickRewardedCopy(
  status: QuotaStatus | null | undefined,
  grantedAmount: number | null,
): RewardedCopy {
  // 보상을 막 받은 직후 화면이 항상 최우선 — 남은 한도와 무관하게 성공을 보여준다.
  //
  // 남은 횟수가 있으면 그것까지 말한다. 안 그러면 오늘 한 번 더 받을 수 있는 +20단어를
  // 모른 채 지나가는데, 설정 화면에도 같은 구멍이 있었다(ad-benefit-copy.ts 주석).
  // 🔑 여기서 rewardViewsLeft 를 쓰는 이유: hasRewardViewsRemaining 은 카운터가 안 온
  //    응답에 true 를 주는데, 성공 화면에서 그 true 는 **못 받을 보상을 약속**하는 거짓이
  //    된다. 지급 직후 status 는 refreshQuota 를 await 한 뒤라 최신이다(useRewardedAd).
  if (grantedAmount !== null) {
    const left = rewardViewsLeft(status);
    return {
      titleKey: 'ads.rewardedGrantedTitle',
      bodyKey: left != null && left >= 1 ? 'ads.rewardedGrantedBodyMore' : 'ads.rewardedGrantedBody',
      cta: 'none',
      icon: 'play-circle',
    };
  }

  // ⚠️ `!!status &&` 를 빼면 안 된다. hasRewardViewsRemaining(null) 은 false 라서
  //    부정하면 "아직 status 가 안 온 사용자"가 광고 소진으로 잘못 분류된다.
  const exhausted = !!status && !hasRewardViewsRemaining(status);
  const quotaExhausted = isAiQuotaExhausted(status);

  if (quotaExhausted) {
    return exhausted
      ? { titleKey: 'ads.rewardedTitle', bodyKey: 'ads.rewardedExhausted', cta: 'pro', icon: 'sparkles' }
      : { titleKey: 'ads.rewardedTitle', bodyKey: 'ads.rewardedBody', cta: 'watch', icon: 'play-circle' };
  }

  // 잔량이 0은 아니지만 요청한 개수에는 모자란 자리. 광고 보너스(+20×2)가 붙은 뒤
  // 20단어 생성을 시도하면 여기로 온다 — 제목이 "모두 사용했어요"면 거짓이 된다.
  return exhausted
    ? { titleKey: 'ads.rewardedShortTitle', bodyKey: 'ads.rewardedExhausted', cta: 'pro', icon: 'sparkles' }
    : { titleKey: 'ads.rewardedBenefitTitle', bodyKey: 'ads.rewardedBenefitBody', cta: 'watch', icon: 'play-circle' };
}
