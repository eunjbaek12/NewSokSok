/**
 * 「광고를 보면 몇 개를 채울 수 있는가」 — 순수 함수.
 *
 * 왜 함수로 빼는가: **이 저장소는 여기서 이미 한 번 틀렸다.** 광고 CTA 가
 * `hasRewardViewsRemaining` 으로 횟수를 말해 못 받을 보상을 약속했다
 * (project_rewarded_modal_copy_split). 약속한 수와 실제로 되는 수가 갈리는 자리는
 * 조건이 넷(잔량·보상·상한·대상)이라 컴포넌트 안 클로저에 두면 눈으로 확인하는
 * 수밖에 없다 — face.ts·merge.ts 와 같은 처방을 쓴다.
 *
 * 🔴 **남은 한도 + 보상을 넘는 수를 약속하지 않는다.**
 *
 * | 대상 | 잔량 | 보상 | 버튼        |
 * |------|------|------|-------------|
 * | 12   | 5    | 20   | 12개 다 채우기 (5+20=25 ≥ 12) |
 * | 30   | 5    | 20   | 25개 채우기   (5+20=25 < 30)  |
 *
 * 🔑 이 제안은 **잔량이 일부 남았을 때**의 것이다. 잔량 0 은 기존 ② 얼굴(광고가 주 버튼)이
 * 맡는다 — 거기서는 광고 말고 길이 없고, 여기서는 무료 경로가 주 버튼이다.
 */

export interface AdFillOffer {
  /** 광고를 본 뒤 실제로 채울 수 있는 수. 버튼에 적는 수가 이것이다. */
  count: number;
  /** 대상을 전부 덮는가 — 「다 채우기」라고 말해도 되는지. */
  coversAll: boolean;
}

export interface AdFillOfferInput {
  /** 채울 대상 전체 수. */
  target: number;
  /** 지금(광고 없이) 채울 수 있는 수 — 잔량으로 이미 잘린 값. */
  fillable: number;
  /** 광고 1회 보상(단어 수). */
  rewardAmount: number;
  /** 오늘 광고를 더 볼 수 있는가. 🔴 판정을 여기서 다시 만들지 않는다 — 호출부의 값을 그대로 받는다. */
  canWatchAd: boolean;
  /** BYOK — 앱 차원의 한도가 없으므로 광고로 얻을 것도 없다. */
  unlimited: boolean;
}

/** 광고 버튼을 낼지, 낸다면 몇 개라고 말할지. 낼 이유가 없으면 null. */
export function pickAdFillOffer(s: AdFillOfferInput): AdFillOffer | null {
  if (s.unlimited || !s.canWatchAd || s.rewardAmount <= 0) return null;
  // 잔량 0 은 이 제안의 자리가 아니다(위 🔑). 대상이 이미 다 되는 경우도 마찬가지 —
  // 광고를 봐도 더 채울 것이 없는데 버튼을 내면 그냥 광고를 파는 것이 된다.
  if (s.fillable <= 0 || s.target <= s.fillable) return null;
  const count = Math.min(s.target, s.fillable + s.rewardAmount);
  return { count, coversAll: count >= s.target };
}
