const { withEntitlementsPlist } = require('expo/config-plugins');

/**
 * expo-notifications의 iOS 플러그인(withNotificationsIOS)은 로컬/원격을 구분하지 않고
 * 무조건 `aps-environment` entitlement를 주입한다. 이 entitlement는 원격 푸시(APNs) 전용이라
 * App ID에 Push Notifications capability + 그걸 지원하는 프로비저닝 프로필을 요구한다.
 *
 * 이 앱의 복습 알림은 100% 로컬 알림(scheduleNotificationAsync·DATE 트리거)만 쓰고
 * 원격 푸시 토큰(getDevicePushToken/getExpoPushToken)은 전혀 등록하지 않는다. 따라서
 * aps-environment는 불필요한 dead entitlement이며, 이게 있으면 기존(푸시 미포함) 프로필로
 * 서명이 실패한다(빌드 30 XCODE_BUILD_ERROR: "profile doesn't support Push Notifications").
 *
 * expo-notifications가 넣은 뒤 이 플러그인이 다시 제거하도록, app.config.js의 plugins 배열에서
 * 반드시 'expo-notifications' *뒤에* 등록한다(mod는 배열 순서대로 적용됨).
 *
 * 훗날 원격 푸시가 필요해지면: 이 플러그인을 제거하고 Apple 포털에 Push Notifications
 * capability 등록 + 프로필 재발급(대화형 `eas build`)으로 전환하면 된다.
 */
module.exports = function withNoApsEnvironment(config) {
  return withEntitlementsPlist(config, (cfg) => {
    delete cfg.modResults['aps-environment'];
    return cfg;
  });
};
