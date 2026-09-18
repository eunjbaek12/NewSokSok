/**
 * 홈 «단어 알림» 권유 카드 — 보일지 말지(순수). 설계: docs/word-notifications-design.md §10.
 *
 * ## 왜 홈에 두나
 *
 * 단어 알림은 설정 탭 안에만 있었다. 그런데 이 기능이 노리는 사람이 **설정을 안 여는 사람**이다
 * (8/19 실측 — 단어 20개 이상 가진 44명 중 22명이 학습을 한 번도 안 열었다). 업데이트 소식에
 * 한 줄 적는 것만으로는 못 덮는다. 소식 시트는 버전이 올라간 사람에게만 뜨고 **새로 설치한
 * 사람에게는 안 뜨기 때문**이다(constants/announcements.ts — version이 app.json과 같을 때만).
 *
 * ## 왜 창이 아니라 화면에 박힌 카드인가
 *
 * 홈에는 이미 창이 셋이다(복습 권유 · 업데이트 소식 · 학습 결과). RN 형제 Modal 둘이 동시에
 * 뜨면 iOS에서 나중 것이 안 보인다(CLAUDE.md). 카드는 그 제약 자체가 없고, 이건 권한을 묻는
 * 창이 아니라 «이런 게 있어요» 소개라 화면을 덮을 일도 아니다.
 */
import type { ReviewNotificationSettings, WordNotificationSettings } from '@shared/contracts';

/**
 * 카드를 띄울 최소 «보낼 수 있는 단어» 수.
 *
 * 20개인 이유: 기본값(하루 5번)으로 **나흘은 가는 양**이다. 이보다 적으면 켜자마자
 * «곧 멈춰요» 안내가 따라붙어, 카드가 약속한 것과 실제가 어긋난다.
 */
export const WORD_NOTIF_PROMO_MIN_WORDS = 20;

/**
 * 복습 알림 권유에 «아니»라고 답한 적이 있는가.
 *
 * `softAsked`는 시트를 닫은 순간 «나중에»든 시스템 창 거절이든 true가 된다
 * (features/study/review/use-review-notifications.ts). 둘을 가르지 않는 이유:
 * 어느 쪽이든 **알림 얘기에 이미 아니라고 답한 사람**이고, 며칠 뒤 다른 알림을 권하는 것은
 * 복습 권유가 내건 «다시 조르지 않는다»의 정반대다.
 *
 * 거절 쪽에는 이유가 하나 더 있다 — 알림 권한은 앱에 하나뿐이라(requestPermissionsAsync),
 * iOS는 한 번 거절당하면 앱에서 다시 못 묻는다. 그 사람에게 «켜기»를 내밀어야 줄 수 있는 건
 * OS 설정으로 보내는 것뿐이다.
 */
export function declinedReviewPrompt(
  review: Pick<ReviewNotificationSettings, 'softAsked' | 'enabled'>,
): boolean {
  return review.softAsked && !review.enabled;
}

export interface WordNotifyPromoInput {
  wordNotif: Pick<WordNotificationSettings, 'enabled' | 'promoDismissed'>;
  review: Pick<ReviewNotificationSettings, 'softAsked' | 'enabled'>;
  /** 지금 설정으로 실제로 보낼 수 있는 단어 수 — «단어를 몇 개 가졌나»가 아니다. */
  sendableCount: number;
}

/**
 * 셋 다 맞아야 띄운다: 아직 안 켰고 · 닫은 적 없고 · 복습 권유를 거절한 적 없고 · 보낼 단어가 넉넉하다.
 *
 * `sendableCount`가 «가진 단어»가 아닌 이유: 500개를 다 외운 사람은 보낼 단어가 0이라
 * 켜자마자 멈춘다. 카드는 실제로 올 알림만 약속해야 한다.
 */
export function shouldShowWordNotifyPromo({
  wordNotif,
  review,
  sendableCount,
}: WordNotifyPromoInput): boolean {
  if (wordNotif.enabled) return false;
  if (wordNotif.promoDismissed) return false;
  if (declinedReviewPrompt(review)) return false;
  return sendableCount >= WORD_NOTIF_PROMO_MIN_WORDS;
}
