import { Platform, Linking } from 'react-native';
import * as StoreReview from 'expo-store-review';
import { loadReviewState, recordReviewAsked } from './review-storage';
import { shouldAsk } from './should-ask';

// iOS App Store ID(App Store Connect Apple ID, eas.json ascAppId)·Android 패키지 —
// 네이티브 리뷰가 불가능한 기기에서만 쓰는 스토어 리스팅 폴백용.
const IOS_APP_ID = '6776714408';
const ANDROID_PACKAGE = 'com.soksokvoca';

function storeListingUrl(): string {
  return Platform.OS === 'ios'
    ? `https://apps.apple.com/app/id${IOS_APP_ID}`
    : `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
}

/**
 * 수동 "앱 평가하기" 버튼용. 사용자가 직접 눌렀으므로 우리 쿨다운/상한(shouldAsk)과
 * 무관하게 매번 시도하되, 자동 넛지 예산(recordReviewAsked)은 소모하지 않는다.
 *
 * 가능하면 네이티브 인앱 리뷰 팝업(별점+리뷰 제출까지 앱 안에서 완결·"다음에" 버튼
 * 내장)을 띄운다. 표시 여부는 OS가 통제하며(최근 표시·연 한도) 실제로 안 뜰 수 있으나
 * 우리에게 알려주지 않는다 — 표시 성공을 가정하지 않는다. 네이티브 리뷰 자체가
 * 불가능한 기기(예: Play 스토어 없음)에서만 스토어 리스팅 페이지로 폴백한다.
 */
export async function requestManualReview(): Promise<void> {
  try {
    if (await StoreReview.isAvailableAsync()) {
      await StoreReview.requestReview();
      return;
    }
  } catch {}
  try {
    await Linking.openURL(storeListingUrl());
  } catch {}
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
