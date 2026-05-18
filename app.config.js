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
  ],
};
