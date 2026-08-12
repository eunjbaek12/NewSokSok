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
// expo-tracking-transparency는 Android native module이 없는데도 requireNativeModule
// (옵셔널 X)로 즉시 import한다 → top-level import 시 Android에서 "Cannot find native
// module 'ExpoTrackingTransparency'"로 throw → admob.ts 로드 자체 실패. iOS 전용으로
// lazy require해 Android에선 모듈 평가 자체를 피한다.

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
    // iOS 14.5+: App Tracking Transparency (ATT) 동의를 광고 SDK 초기화 이전에
    // 요청해야 IDFA 사용 가능. AdMob 권장 순서.
    //   - 동의: 개인화 광고 (eCPM ↑)
    //   - 거부/미정: 비개인화 광고 (수익 ↓이지만 광고는 계속 노출됨)
    // ATT 거부해도 앱 기능엔 영향 없고, AdMob도 IDFA 없이 광고 노출은 가능하다.
    // Android에선 ATT 자체가 없어 즉시 granted로 응답 → skip.
    if (Platform.OS === 'ios') {
      await requestATTConsent();
    }

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
// ATT (App Tracking Transparency) — iOS 14.5+
// ────────────────────────────────────────────────────────────
//
// 시스템 모달은 사용자당 한 번만 노출 가능. 두 번째부터는 OS가 즉시 기존 응답을
// 반환하므로 매 실행마다 호출해도 안전 (사용자 방해 X). 사용자가 한 번 결정한
// 후엔 시스템 설정 → 개인정보 보호 → 추적에서만 변경 가능.
async function requestATTConsent(): Promise<void> {
  try {
    // iOS-only lazy require. 모듈 헤더 주석 참고 — Android에서 top-level import는
    // requireNativeModule throw로 admob 전체를 못 쓰게 만든다.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const tracking = require('expo-tracking-transparency') as {
      getTrackingPermissionsAsync: () => Promise<{ status: string; canAskAgain: boolean }>;
      requestTrackingPermissionsAsync: () => Promise<{ status: string }>;
    };
    const current = await tracking.getTrackingPermissionsAsync();
    if (current.status === 'undetermined' && current.canAskAgain) {
      await tracking.requestTrackingPermissionsAsync();
    }
  } catch {
    // 모듈 로드 실패(dev client 미빌드)·ATT 요청 실패 모두 비개인화 광고로 동작.
    // 사용자 경험 영향 없음.
  }
}

// ────────────────────────────────────────────────────────────
// 광고 활성 가드
// ────────────────────────────────────────────────────────────
export interface AdEligibilityInput {
  /** Edge Function get_ai_quota_status 응답의 tier ('free' | 'pro'). 게스트면 null. */
  tier: 'guest' | 'free' | 'pro' | null;
  adFreeUntil?: string | null;
}

export function isAdsAllowed(input: AdEligibilityInput): boolean {
  if (input.tier === 'pro') return false; // 트라이얼 포함 (RPC에서 trial → tier='pro' 매핑)
  if (input.adFreeUntil && new Date(input.adFreeUntil).getTime() > Date.now()) return false;
  return true;
}
