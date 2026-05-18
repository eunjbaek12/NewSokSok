// AdMob 통합 유틸 (v1.1).
//
// 실 광고 단위 ID는 EAS Secret `EXPO_PUBLIC_ADMOB_ANDROID_*` 로 주입.
// 미설정 시 Google 공식 테스트 ID로 fallback — 개발/사전 빌드에서 광고가 정상 작동하는지
// 확인 가능. 실 ID 발급 후엔 환경변수만 바꾸면 됨 (코드 변경 X).
//
// 광고 활성 정책:
//   - 14세 미만: 모든 광고 차단 (KR 아동 보호 + AdMob 정책)
//   - Pro / 트라이얼: 모든 광고 차단 (Pro 약속 무결성)
//   - 그 외 (Free / 게스트): 광고 노출

import mobileAds, { MaxAdContentRating, TestIds } from 'react-native-google-mobile-ads';
import { Platform } from 'react-native';

// ────────────────────────────────────────────────────────────
// 광고 단위 ID (env override → TestIds fallback)
// ────────────────────────────────────────────────────────────
const env = (key: string): string | undefined => {
  const v = process.env[key];
  return v && v.length > 0 ? v : undefined;
};

export const AD_UNIT_BANNER =
  Platform.OS === 'ios'
    ? env('EXPO_PUBLIC_ADMOB_IOS_BANNER_ID') ?? TestIds.BANNER
    : env('EXPO_PUBLIC_ADMOB_ANDROID_BANNER_ID') ?? TestIds.BANNER;

export const AD_UNIT_REWARDED =
  Platform.OS === 'ios'
    ? env('EXPO_PUBLIC_ADMOB_IOS_REWARDED_ID') ?? TestIds.REWARDED
    : env('EXPO_PUBLIC_ADMOB_ANDROID_REWARDED_ID') ?? TestIds.REWARDED;

export const IS_USING_TEST_ADS = AD_UNIT_BANNER === TestIds.BANNER;

// ────────────────────────────────────────────────────────────
// 초기화 — _layout.tsx에서 1회 호출
// ────────────────────────────────────────────────────────────
let initialized = false;

export async function initAdMob(): Promise<void> {
  if (initialized) return;
  initialized = true;

  try {
    await mobileAds().setRequestConfiguration({
      maxAdContentRating: MaxAdContentRating.PG,
      tagForChildDirectedTreatment: false,
      tagForUnderAgeOfConsent: false,
    });
    await mobileAds().initialize();
  } catch {
    // 초기화 실패해도 앱 동작은 유지. 광고만 로드 실패.
  }
}

// ────────────────────────────────────────────────────────────
// 광고 활성 가드
// ────────────────────────────────────────────────────────────
export interface AdEligibilityInput {
  /** Edge Function get_ai_quota_status 응답의 tier ('free' | 'pro'). 게스트면 null. */
  tier: 'free' | 'pro' | null;
  /** 14세 미만 자가 신고 (ProfileSettings 등에서). #11 약관 동의 흐름에서 입력 예정. */
  isUnder14?: boolean;
}

export function isAdsAllowed(input: AdEligibilityInput): boolean {
  if (input.isUnder14) return false;
  if (input.tier === 'pro') return false; // 트라이얼 포함 (RPC에서 trial → tier='pro' 매핑)
  return true;
}
