// AdMob 통합 유틸 (v1.1).
//
// 실 광고 단위 ID는 EAS Secret `EXPO_PUBLIC_ADMOB_ANDROID_*` 로 주입.
// 미설정 시 Google 공식 테스트 ID로 fallback — 개발/사전 빌드에서 광고가 정상 작동하는지
// 확인 가능. 실 ID 발급 후엔 환경변수만 바꾸면 됨 (코드 변경 X).
//
// 광고 활성 정책:
//   - Pro / 트라이얼: 모든 광고 차단 (Pro 약속 무결성)
//   - 그 외 (Free / 게스트): 광고 노출

import mobileAds, { MaxAdContentRating, TestIds } from 'react-native-google-mobile-ads';
import { Platform } from 'react-native';

// ────────────────────────────────────────────────────────────
// 광고 단위 ID (env override → TestIds fallback)
// ────────────────────────────────────────────────────────────
// Expo의 expo/no-dynamic-env-var 규칙은 process.env 동적 키 접근을 금지한다
// (Metro의 EXPO_PUBLIC_* inline replacement이 정적 식별자만 인식하기 때문).
// 따라서 platform 분기마다 직접 정적 접근을 쓴다.
function nonEmpty(v: string | undefined): string | undefined {
  return v && v.length > 0 ? v : undefined;
}

export const AD_UNIT_BANNER =
  Platform.OS === 'ios'
    ? nonEmpty(process.env.EXPO_PUBLIC_ADMOB_IOS_BANNER_ID) ?? TestIds.BANNER
    : nonEmpty(process.env.EXPO_PUBLIC_ADMOB_ANDROID_BANNER_ID) ?? TestIds.BANNER;

export const AD_UNIT_REWARDED =
  Platform.OS === 'ios'
    ? nonEmpty(process.env.EXPO_PUBLIC_ADMOB_IOS_REWARDED_ID) ?? TestIds.REWARDED
    : nonEmpty(process.env.EXPO_PUBLIC_ADMOB_ANDROID_REWARDED_ID) ?? TestIds.REWARDED;

export const IS_USING_TEST_ADS = AD_UNIT_BANNER === TestIds.BANNER;

// ────────────────────────────────────────────────────────────
// 초기화 — _layout.tsx에서 1회 호출
// ────────────────────────────────────────────────────────────
let initialized = false;

export async function initAdMob(): Promise<void> {
  if (initialized) return;
  initialized = true;

  // Belt-and-suspenders for the app.config.js build-time check: if a
  // production AAB still ships with TestIds (e.g. someone forces a local
  // build, or rules out EAS), surface it in logcat so the operator notices
  // before users do. console.warn survives babel-plugin-transform-remove-console
  // in production (see babel.config.js).
  if (IS_USING_TEST_ADS) {
    console.warn(
      '[admob] Using Google test ad unit IDs — no real ad revenue. ' +
      'Set EXPO_PUBLIC_ADMOB_ANDROID_{APP,BANNER,REWARDED}_ID env vars.',
    );
  }

  try {
    await mobileAds().initialize();
    // tagForChildDirectedTreatment / tagForUnderAgeOfConsent는 생략 → SDK 상 "운영자가 신원 모름" 표명.
    // 앱은 만 14세 이상 대상이고 연령을 수집하지 않으므로 child-directed treatment를 단언하지 않는다.
    await mobileAds().setRequestConfiguration({
      maxAdContentRating: MaxAdContentRating.PG,
    });
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
}

export function isAdsAllowed(input: AdEligibilityInput): boolean {
  if (input.tier === 'pro') return false; // 트라이얼 포함 (RPC에서 trial → tier='pro' 매핑)
  return true;
}
