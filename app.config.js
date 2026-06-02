// Dynamic config — overrides googleServicesFile with EAS file env var when present.
// Local dev: falls back to ./google-services.json (file on disk, not in git).
// EAS Build: set GOOGLE_SERVICES_JSON as a file secret env var.
const { expo } = require('./app.json');
const withLocalizedATT = require('./plugins/withLocalizedATT');

// AdMob App ID. EAS Secret `EXPO_PUBLIC_ADMOB_ANDROID_APP_ID` (실 ID) 또는
// 미설정 시 Google 공식 테스트 App ID로 fallback.
const ADMOB_ANDROID_TEST_APP_ID = 'ca-app-pub-3940256099942544~3347511713';
const ADMOB_IOS_TEST_APP_ID = 'ca-app-pub-3940256099942544~1458002511';
const androidAppId = process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID || ADMOB_ANDROID_TEST_APP_ID;
const iosAppId = process.env.EXPO_PUBLIC_ADMOB_IOS_APP_ID || ADMOB_IOS_TEST_APP_ID;

// Production 빌드 환경변수 검증.
//
// 누락된 채로 production AAB이 나가면 (a) AdMob이 TestIds로 fallback해
// 광고 노출은 되지만 수익 0원 (b) Supabase URL이 없어 앱이 클라우드 동기화/
// 로그인 즉시 크래시. 둘 다 사용자에게는 보이지만 운영자에겐 며칠~수주
// 뒤에야 인지되는 사일런트 실패라 출시 직전 차단이 가장 효과적.
//
// EAS_BUILD_PROFILE은 EAS cloud build 환경에서만 세팅됨 — 로컬 `pnpm
// start`나 dev build는 영향받지 않는다. iOS는 v1.2 출시 대상이라 iOS
// 빌드 시점에만 iOS env를 요구.
if (process.env.EAS_BUILD_PROFILE === 'production') {
  const platform = process.env.EAS_BUILD_PLATFORM;
  const required = [
    'EXPO_PUBLIC_SUPABASE_URL',
    'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    'EXPO_PUBLIC_GOOGLE_CLIENT_ID',
  ];
  if (platform !== 'ios') {
    required.push(
      'EXPO_PUBLIC_ADMOB_ANDROID_APP_ID',
      'EXPO_PUBLIC_ADMOB_ANDROID_BANNER_ID',
      'EXPO_PUBLIC_ADMOB_ANDROID_REWARDED_ID',
    );
  }
  if (platform === 'ios') {
    required.push(
      'EXPO_PUBLIC_ADMOB_IOS_APP_ID',
      'EXPO_PUBLIC_ADMOB_IOS_BANNER_ID',
      'EXPO_PUBLIC_ADMOB_IOS_REWARDED_ID',
      // iOS Google Sign-In은 iOS 타입 OAuth 클라이언트가 따로 필요. webClientId만으론
      // DEVELOPER_ERROR(code 10). features/auth/store.ts:configureGoogleSignIn 참조.
      'EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS',
    );
  }
  const missing = required.filter((k) => !process.env[k] || process.env[k].length === 0);
  if (missing.length > 0) {
    throw new Error(
      '[app.config] Production build is missing required environment variables:\n  - ' +
      missing.join('\n  - ') +
      '\n\nRegister these as EAS Secrets before re-running ' +
      "`eas build --profile production` (see docs/handoff-play-release.md)."
    );
  }
}

/** @type {import('@expo/config').ExpoConfig} */
module.exports = {
  ...expo,
  android: {
    ...expo.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
  },
  plugins: [
    ...expo.plugins,
    [
      'react-native-google-mobile-ads',
      {
        androidAppId,
        iosAppId,
      },
    ],
    // NSUserTrackingUsageDescription을 ko/en .lproj로 다국어화. expo-tracking-transparency
    // plugin은 base 값만 다루므로 글로벌 출시용으로 별도 plugin이 필요. 자세한 동작은
    // plugins/withLocalizedATT.js 헤더 참고.
    withLocalizedATT,
  ],
};
