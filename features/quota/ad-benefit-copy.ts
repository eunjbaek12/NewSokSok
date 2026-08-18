import { hasRewardViewsRemaining, rewardViewsLeft } from './reward-eligibility';
import type { QuotaStatus } from './store';

/**
 * 설정 화면의 "광고 보고 혜택 받기" 줄이 무엇을 보여줄지 한 번에 고른다.
 *
 * 🔴 이 함수가 생긴 이유: 그 줄은 제목과 설명이 **각자 `ad_free_until` 한 축만** 보고 있었다
 * (settings.tsx:306·:311). 그래서 광고를 1회만 본 사용자에게는 "광고 없이 학습 중 / ~까지"만
 * 뜨고 **남은 1회(+20단어)가 어디에도 안 보였다** — 받을 수 있는 것을 모른 채 지나간다.
 * 제목이 *상태*를 말하느라 *남은 기회*를 덮은 것이다. 판정이 두 곳으로 복제돼 있던 것도
 * 보상형 모달이 제목만 분기를 빠뜨렸던 사고와 같은 형태다(rewarded-copy.ts 주석).
 *
 * 축은 둘이고, 둘 다 봐야 한다:
 * - 배너 상태 (`ad_free_until`) = 지금 광고가 없는가
 * - 남은 횟수 (`reward_max_views - reward_views`) = 더 받을 것이 있는가
 *
 * | | 배너제거 | 남은횟수 | 제목 | 부제 |
 * |---|---|---|---|---|
 * | A | ✘ | ✔ | 광고 보고 혜택 받기 | 자동완성 20개 + 24시간 배너 제거 |
 * | B | ✔ | ✔ | 광고 없이 학습 중 | ~까지 · 한 번 더 보면 +20단어 |
 * | C | ✔ | ✘ | 광고 없이 학습 중 | ~까지 · 오늘 혜택은 다 받았어요 |
 * | D | ✘ | ✘ | 오늘 광고 혜택을 다 받았어요 | 한국 시간 자정에 다시 볼 수 있어요 |
 *
 * D 는 정상 경로로는 오지 않는다 — 광고 시청 횟수의 자정 초기화가 `ad_free_until`(24h)
 * 만료보다 항상 먼저 오기 때문이다. 서버가 `ad_free_until` 을 못 준 예외에서만 드러나는데,
 * 그 자리를 비워 두면 A 로 떨어져 **"광고 보고 혜택 받기"라고 써 놓고 눌리지 않는** 화면이
 * 된다(현행). 도달 불가한 상태에도 참인 문구를 주는 쪽이 싸다.
 */
export type AdBenefitCopy = {
  titleKey: string;
  /** 부제 조각. 여러 개면 ' · ' 로 잇는다. */
  subtitleKeys: string[];
  /** 누를 것이 있는가 = 오늘 볼 광고가 남았는가. */
  pressable: boolean;
};

/**
 * 보여줄 것이 없으면 null — Pro 는 광고가 없고(그래서 보상도 없고),
 * status 가 아직 없으면 무엇도 단정할 수 없다. BYOK 여부는 status 에 없으므로 호출부가 본다.
 */
export function pickAdBenefitCopy(
  status: QuotaStatus | null | undefined,
  now: number = Date.now(),
): AdBenefitCopy | null {
  if (!status || status.tier === 'pro') return null;

  const adFree = !!status.ad_free_until && new Date(status.ad_free_until).getTime() > now;
  const viewsRemaining = hasRewardViewsRemaining(status);

  if (!adFree) {
    return viewsRemaining
      ? { titleKey: 'settings.adBenefitTitle', subtitleKeys: ['settings.adBenefitDesc'], pressable: true }
      : { titleKey: 'settings.adBenefitAllUsed', subtitleKeys: ['settings.adBenefitResets'], pressable: false };
  }

  if (!viewsRemaining) {
    return {
      titleKey: 'settings.adBenefitActive',
      subtitleKeys: ['settings.adBenefitUntil', 'settings.adBenefitDone'],
      pressable: false,
    };
  }

  // "한 번 더"는 정확히 1회 남았다고 **알 때만** 쓴다. 카운터가 안 온 응답이거나 상한이
  // 늘어 2회 이상 남으면 횟수를 말하지 않고 1회분 혜택만 말한다 — 그 문장은 몇 회가
  // 남았든 참이다.
  const left = rewardViewsLeft(status);
  return {
    titleKey: 'settings.adBenefitActive',
    subtitleKeys: ['settings.adBenefitUntil', left === 1 ? 'settings.adBenefitMore' : 'settings.adBenefitDesc'],
    pressable: true,
  };
}
