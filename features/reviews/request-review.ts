import { Platform, Linking } from 'react-native';
import * as StoreReview from 'expo-store-review';
import { loadReviewState, recordReviewAsked } from './review-storage';
import { shouldAsk } from './should-ask';

// iOS App Store ID(App Store Connect Apple ID, eas.json ascAppId)·Android 패키지.
const IOS_APP_ID = '6776714408';
const ANDROID_PACKAGE = 'com.soksokvoca';

/**
 * 수동 버튼이 열 스토어 URL 후보 — 앞에서부터 시도하고 실패하면 다음으로 넘어간다.
 *
 * iOS는 `action=write-review`로 리뷰 작성 화면까지 바로 열 수 있다(Apple이 상시 버튼에
 * 권장하는 형식). `itms-apps:` 를 먼저 쓰는 이유는 App Store 앱을 확실히 띄우기 위함이고,
 * https 후보는 그 스킴을 못 여는 환경(시뮬레이터 등) 대비다.
 *
 * Android에는 리뷰 작성 딥링크가 없어 앱 페이지가 최선이다. `market:` 은 Play 스토어 앱을
 * 직접 띄우고, 스토어 앱이 없는 기기에서만 https(브라우저)로 떨어진다.
 *
 * canOpenURL로 미리 검사하지 않는다 — Android 11+ 는 매니페스트 `<queries>` 선언 없이는
 * 열 수 있는 스킴도 false로 답한다. 그냥 openURL을 던지고 실패하면 다음 후보로 간다.
 */
function reviewUrls(): string[] {
  return Platform.OS === 'ios'
    ? [
        `itms-apps://apps.apple.com/app/apple-store/id${IOS_APP_ID}?action=write-review`,
        `https://apps.apple.com/app/apple-store/id${IOS_APP_ID}?action=write-review`,
      ]
    : [
        `market://details?id=${ANDROID_PACKAGE}`,
        `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`,
      ];
}

/**
 * 수동 "앱 평가하기" 버튼용 — 네이티브 인앱 리뷰 팝업을 쓰지 않고 스토어 리뷰 화면을
 * 직접 연다. 사용자가 직접 눌렀으므로 우리 쿨다운/상한(shouldAsk)과 무관하게 매번
 * 동작하고, 자동 넛지 예산(recordReviewAsked)도 소모하지 않는다.
 *
 * 인앱 팝업을 쓰지 않는 이유: 표시 여부를 OS가 통제하면서 우리에게 알려주지 않는다.
 * 이미 평가한 사용자나 노출 쿼터에 걸린 사용자에게는 호출이 "성공"으로 끝나면서 아무것도
 * 뜨지 않아, 버튼이 고장난 것처럼 보인다(실제로 그렇게 보였다 — Android 정식 설치 기기).
 * 그래서 양 플랫폼 모두 상시 버튼에는 인앱 팝업이 아니라 스토어 링크를 쓰라고 안내한다:
 * Play In-App Review 가이드는 버튼 트리거를 "깨진 경험"이라 명시하고, Apple HIG는 피드백
 * 요청에 버튼을 쓰지 말고 write-review 링크를 두라고 한다.
 *
 * 자동 넛지(maybeRequestReview)는 반대다 — 조용히 넘어가도 되는 자리이므로 인앱 팝업을
 * 그대로 쓴다.
 */
export async function requestManualReview(): Promise<void> {
  for (const url of reviewUrls()) {
    try {
      await Linking.openURL(url);
      return;
    } catch {}
  }
}

// 이번 세션에는 자동 넛지를 쉰다. 업데이트 소식 시트가 뜬 세션이 그 경우다 —
// 소식을 보고 곧이어 별점까지 요청받으면 한 세션에 팝업이 둘이 된다. 리뷰가
// 0개인 지금은 요청 한 번의 질이 횟수보다 중요하다.
//
// 수동 "앱 평가하기" 버튼(requestManualReview)에는 적용하지 않는다 — 사용자가
// 직접 누른 것이므로 억제할 이유가 없다.
let suppressedThisSession = false;

/** 앱을 다시 켜면 풀린다(모듈 수명 = 세션 수명). */
export function suppressAutoReviewForSession(): void {
  suppressedThisSession = true;
}

/**
 * 자동 넛지 — 몰입 순간에 네이티브 인앱 리뷰 팝업(별점만)을 조용히 1회 시도.
 * 우리 쓰로틀(shouldAsk) 통과 + OS가 표시 가능할 때만. 실패·불가용은 전부 무시.
 * OS가 실제 표시 여부를 결정하며 우리에게 알려주지 않으므로, 표시 성공을 가정하지 않는다.
 */
export async function maybeRequestReview(now: number = Date.now()): Promise<void> {
  try {
    if (suppressedThisSession) return;
    const state = await loadReviewState();
    if (!shouldAsk(state, now)) return;
    if (!(await StoreReview.hasAction())) return;
    // 요청 시도 전에 기록 — 도중 실패해도 재시도로 나그되는 것보다 1회 누락이 낫다(쿨다운 우선).
    await recordReviewAsked(now);
    await StoreReview.requestReview();
  } catch {}
}
