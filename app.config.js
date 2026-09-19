// Dynamic config — overrides googleServicesFile with EAS file env var when present.
// Local dev: falls back to ./google-services.json (file on disk, not in git).
// EAS Build: set GOOGLE_SERVICES_JSON as a file secret env var.
const { expo } = require('./app.json');

// AdMob App ID. EAS Secret `EXPO_PUBLIC_ADMOB_ANDROID_APP_ID` (실 ID) 또는
// 미설정 시 Google 공식 테스트 App ID로 fallback.
const ADMOB_ANDROID_TEST_APP_ID = 'ca-app-pub-3940256099942544~3347511713';
const ADMOB_IOS_TEST_APP_ID = 'ca-app-pub-3940256099942544~1458002511';
const androidAppId = process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID || ADMOB_ANDROID_TEST_APP_ID;
const iosAppId = process.env.EXPO_PUBLIC_ADMOB_IOS_APP_ID || ADMOB_IOS_TEST_APP_ID;

// iOS Google Sign-In은 reversed-client-id URL scheme(com.googleusercontent.apps.<id>)이
// Info.plist의 CFBundleURLTypes에 있어야 OAuth 시트가 앱으로 리다이렉트해 돌아온다. 누락 시
// iOS에서 GoogleSignin.signIn()이 실패 → 로그인 화면에 "Login Failed" alert (App Store 심사
// 반려 2.1a, 2026-06-05). google-signin config plugin은 옵션 없이 등록돼 Firebase 모드로
// 동작 중이라(= GoogleService-Info.plist를 읽음, 그런데 iOS plist가 없음) scheme을 안 넣는다.
// Android Firebase 모드 동작을 깨지 않으려 plugin은 그대로 두고 scheme만 직접 주입한다.
// 런타임 iosClientId(EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS, store.ts:configureGoogleSignIn)와 별개의
// 빌드타임 설정이다. env 미설정(Android/로컬 dev)이면 주입하지 않는다 — iOS 전용.
const iosGoogleClientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS || '';
const googleReversedClientScheme = iosGoogleClientId
  ? `com.googleusercontent.apps.${iosGoogleClientId.replace(/\.apps\.googleusercontent\.com$/, '')}`
  : null;

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
      "`eas build --profile production` (see docs/secrets-management.md)."
    );
  }
}

/**
 * 휴대폰 홈 화면 위젯 — Android 전용(iOS 는 SDK 업그레이드 뒤). 2×2 한 종류만.
 *
 * `name` 은 생성되는 위젯 클래스 이름이라 **바꾸면 이미 놓인 위젯이 사라진다.**
 * 갱신 주기는 안드로이드가 30분 미만을 받아 주지 않는다 — 학습을 마칠 때 앱이
 * 갱신을 요청하고, 자정 넘김만 이 주기에 맡긴다(docs/widget-design.md §6-2).
 */
/**
 * 위젯을 만드는 동안 쓰는 별개 앱 — `WIDGET_DEV=1` 로 빌드하면 패키지와 이름이 달라져
 * **폰에 깔린 앱 옆에 나란히** 설치된다. 같은 패키지로 덮으면 서명이 달라 기존 앱을
 * 지우고 깔아야 하고, 그 앱의 단어장이 함께 사라진다.
 * 데이터 디렉터리가 갈리므로 진단이 읽는 DB 도 이 앱만의 것이다.
 */
const isWidgetDev = process.env.WIDGET_DEV === '1';

const widgetConfig = {
  widgets: [
    {
      name: 'Avocado',
      label: 'Avocado',
      // 런처는 칸 수를 (dp + 30) / 70 으로 센다 — 160dp 로 적었더니 삼성 런처가 **2×3 만** 내줬다
      // (9/19 실기). 110dp 가 딱 2칸이다.
      minWidth: '110dp',
      minHeight: '110dp',
      targetCellWidth: 2,
      targetCellHeight: 2,
      // 놓은 뒤 늘릴 수 있게(9/19 은정님 결정). 화면이 실제 높이로 뜻 줄 수를 세므로 세로로
      // 늘리면 뜻이 더 보인다. 가로 전용 모양(3×2)은 아직 없다 — 늘리면 지금 모양이 넓어진다.
      resizeMode: 'horizontal|vertical',
      description: 'Words on your phone home screen',
      previewImage: './assets/images/icon.png',
      updatePeriodMillis: 1800000,
    },
  ],
};

/** @type {import('@expo/config').ExpoConfig} */
module.exports = {
  ...expo,
  ios: {
    ...expo.ios,
    infoPlist: {
      ...expo.ios.infoPlist,
      // Google reversed-client-id scheme을 추가. expo의 `scheme`(soksokvoca)·앱 자체 scheme은
      // prebuild의 withScheme가 이 배열에 append하므로 공존한다. iOS 빌드에서만 주입됨.
      ...(googleReversedClientScheme
        ? {
            CFBundleURLTypes: [
              ...(expo.ios.infoPlist?.CFBundleURLTypes ?? []),
              { CFBundleURLSchemes: [googleReversedClientScheme] },
            ],
          }
        : {}),
    },
  },
  name: isWidgetDev ? 'Avocado dev' : expo.name,
  android: {
    ...expo.android,
    ...(isWidgetDev ? { package: 'com.soksokvoca.dev' } : {}),
    // dev 갈래는 패키지가 달라 Firebase 파일도 다른 것을 쓴다(그 패키지 항목이 없으면
    // Google Services Gradle 플러그인이 빌드를 멈춘다). EAS 에서는 파일 시크릿
    // GOOGLE_SERVICES_JSON_DEV 로 들어온다 — 프로덕션 시크릿은 그대로 둔다.
    googleServicesFile: isWidgetDev
      ? process.env.GOOGLE_SERVICES_JSON_DEV ?? './google-services.json'
      : process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
  },
  plugins: [
    // expo-notifications가 주입하는 aps-environment(원격 푸시 전용) entitlement를 제거한다.
    // 이 앱은 로컬 알림만 쓰므로 불필요하고, 있으면 푸시 미포함 프로비저닝 프로필로 서명이
    // 실패한다. entitlements mod는 "등록 역순"으로 실행되므로(나중 등록이 먼저 실행), 삭제가
    // expo-notifications의 주입보다 나중에 실행되게 하려면 이 플러그인을 배열의 *맨 앞*
    // (= expo-notifications보다 먼저 등록)에 둬야 한다. 상세: 플러그인 주석.
    './plugins/withNoApsEnvironment',
    // expo-audio가 라이브러리 매니페스트로 주입하는 포그라운드 서비스 2개(mediaPlayback·
    // microphone)를 제거한다. Android 15+에서 BOOT_COMPLETED 경로와 만나면 앱이 죽는다
    // (Play Console "제한된 포그라운드 서비스 유형"). expo-audio는 iOS에서만 호출되므로
    // 안 쓰는 서비스다. 음성 입력(expo-speech-recognition)과는 무관 — 상세: 플러그인 주석.
    // 실제 제거는 Gradle manifest merger가 하므로 배열 위치는 무관하다.
    './plugins/withNoAudioForegroundServices',
    ...expo.plugins,
    // 위젯은 config plugin 으로만 남긴다 — `android/` 는 prebuild 가 다시 만들어
    // 커밋하지 않기로 했다(docs/widget-design.md §-1).
    ['react-native-android-widget', widgetConfig],
    [
      'react-native-google-mobile-ads',
      {
        androidAppId,
        iosAppId,
      },
    ],
    // iOS pod install 수정: Google Mobile Ads가 끌어오는 Swift pod `AppCheckCore`가
    // `GoogleUtilities`·`RecaptchaInterop`을 static library로 import하려면 두 pod이
    // modular headers를 정의해야 한다. managed 워크플로는 Podfile.lock을 안 박아
    // 매 빌드 CocoaPods 최신 버전을 재해석하는데, build 11 이후 AppCheckCore 드리프트로
    // 이 요구가 생겨 pod install이 실패했다. 전역 useFrameworks 전환은 다른 pod을 깰
    // 위험이 있어, 문제 pod 2개에만 targeted로 modular headers를 부여한다.
    [
      'expo-build-properties',
      {
        ios: {
          extraPods: [
            { name: 'GoogleUtilities', modular_headers: true },
            { name: 'RecaptchaInterop', modular_headers: true },
          ],
        },
      },
    ],
    // NSUserTrackingUsageDescription 다국어화는 expo.locales(languages/ko.json·en.json)가
    // InfoPlist.strings로 처리한다. 과거의 withLocalizedATT plugin은 같은 InfoPlist.strings를
    // 중복 생성해 "Multiple commands produce" Xcode 충돌을 일으켜 제거했다(expo.locales 도입 후).
  ],
};
