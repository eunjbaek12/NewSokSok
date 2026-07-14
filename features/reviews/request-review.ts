import { Platform, Linking } from 'react-native';
import * as StoreReview from 'expo-store-review';
import { loadReviewState, recordReviewAsked } from './review-storage';
import { shouldAsk } from './should-ask';

// iOS App Store ID(App Store Connect Apple ID, eas.json ascAppId)·Android 패키지 —
// 스토어 리스팅 딥링크용.
const IOS_APP_ID = '6776714408';
const ANDROID_PACKAGE = 'com.soksokvoca';

/**
 * 스토어 "리스팅 페이지"로 직접 이동(글쓰기 작성기 X). 거기서 별 탭 하나로 별점만
 * 즉시 제출된다(글 안 써도 됨). 사용자 주도라 OS 쓰로틀과 무관 — 항상 열린다.
 * 설정·통계 화면의 수동 "앱 평가하기" 버튼용.
 */
export async function openStoreReview(): Promise<void> {
  const url =
    Platform.OS === 'ios'
      ? `https://apps.apple.com/app/id${IOS_APP_ID}`
      : `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
  try {
    await Linking.openURL(url);
  } catch {}
}

/**
 * 자동 넛지 — 몰입 순간에 네이티브 인앱 리뷰 팝업(별점만)을 조용히 1회 시도.
 * 우리 쓰로틀(shouldAsk) 통과 + OS가 표시 가능할 때만. 실패·불가용은 전부 무시.
 * OS가 실제 표시 여부를 결정하며 우리에게 알려주지 않으므로, 표시 성공을 가정하지 않는다.
 */
export async function maybeRequestReview(now: number = Date.now()): Promise<void> {
  try {
    const state = await loadReviewState();
    if (!shouldAsk(state, now)) return;
    if (!(await StoreReview.hasAction())) return;
    // 요청 시도 전에 기록 — 도중 실패해도 재시도로 나그되는 것보다 1회 누락이 낫다(쿨다운 우선).
    await recordReviewAsked(now);
    await StoreReview.requestReview();
  } catch {}
}
