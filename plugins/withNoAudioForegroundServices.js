const { withAndroidManifest } = require('expo/config-plugins');

/**
 * expo-audio가 Android 매니페스트에 주입하는 포그라운드 서비스 2개를 제거한다.
 *
 * expo-audio의 라이브러리 매니페스트(node_modules/expo-audio/android/src/main/AndroidManifest.xml)는
 * `mediaPlayback` 타입 AudioControlsService와 `microphone` 타입 AudioRecordingService를 선언한다.
 * Android 15+는 BOOT_COMPLETED로 시작된 프로세스가 이 타입의 포그라운드 서비스를 시작하면
 * 앱을 종료시킨다 → Play Console "제한된 포그라운드 서비스 유형" 경고(2026-07-21 확인).
 * 이 앱은 expo-notifications가 복습 알림 재예약용으로 BOOT_COMPLETED를 듣기 때문에 해당된다.
 *
 * 이 앱은 두 서비스를 쓰지 않는다. expo-audio는 iOS 무음 스위치 대응 한 곳에서만 쓰이고
 * (`lib/tts.ts` ensureAudioMode → setAudioModeAsync), 그 함수는 `Platform.OS !== 'ios'`면
 * 즉시 반환하므로 Android에서는 require조차 실행되지 않는다. 재생은 expo-speech가 한다.
 *
 * ⚠️ 마이크 관련 패키지가 둘이라 헷갈리기 쉽다 — 역할이 정반대다:
 *   - expo-speech-recognition = 단어 음성 입력(app/add-word.tsx). 실제로 쓰인다.
 *     라이브러리 매니페스트가 비어 있어 여기서 제거되는 것이 없고, RECORD_AUDIO 권한은
 *     app.json의 android.permissions에서 직접 선언한다. **절대 건드리지 말 것.**
 *   - expo-audio = iOS 전용. 여기서 서비스만 제거한다.
 *
 * ⚠️ 권한은 여기서 지우지 않는다 — `app.json`의 `android.blockedPermissions`에 있다
 * (`FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`). 처음에는 "서비스가 없으면
 * 권한은 무해하고, FOREGROUND_SERVICE는 expo-notifications도 요구할 수 있다"고 보고 남겼는데
 * **둘 다 틀렸다**(2026-07-28):
 *   - Play는 서비스가 아니라 **권한**을 보고 "포그라운드 서비스 권한" 선언을 요구한다.
 *     안 쓰는 권한이라 적을 용도가 없고, 선언 기한이 지나면 업데이트 출시가 막힌다.
 *   - `node_modules` 전체를 훑어보니 FOREGROUND_SERVICE 계열을 선언하는 라이브러리는
 *     expo-audio 하나뿐이다. expo-notifications는 RECEIVE_BOOT_COMPLETED와
 *     POST_NOTIFICATIONS만 요구한다. 추측으로 남겨 둔 한 줄이 선언 요구를 불렀다.
 *
 * 플러그인 순서는 무관하다. expo-audio는 config plugin이 아니라 라이브러리 매니페스트로
 * 서비스를 넣고, 실제 병합·제거는 Gradle manifest merger가 빌드 시점에 수행한다. 여기서는
 * 앱 매니페스트에 `tools:node="remove"` 지시만 남긴다. (entitlements mod가 등록 역순이라
 * 맨 앞에 둬야 하는 withNoApsEnvironment와는 사정이 다르다.)
 *
 * 훗날 Android에서 expo-audio로 오디오를 재생·녹음하게 되면 이 플러그인을 제거해야 한다.
 */
const SERVICES_TO_REMOVE = [
  'expo.modules.audio.service.AudioControlsService',
  'expo.modules.audio.service.AudioRecordingService',
];

module.exports = function withNoAudioForegroundServices(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    // tools:node를 쓰려면 tools 네임스페이스가 선언돼 있어야 한다(blockedPermissions가 이미
    // 선언해 두지만, 이 플러그인만으로도 성립하도록 방어적으로 보장한다).
    manifest.$ = manifest.$ || {};
    manifest.$['xmlns:tools'] = manifest.$['xmlns:tools'] || 'http://schemas.android.com/tools';

    const application = manifest.application?.[0];
    if (!application) return cfg;

    application.service = application.service || [];
    for (const name of SERVICES_TO_REMOVE) {
      const alreadyRemoved = application.service.some(
        (s) => s?.$?.['android:name'] === name && s?.$?.['tools:node'] === 'remove',
      );
      if (!alreadyRemoved) {
        application.service.push({ $: { 'android:name': name, 'tools:node': 'remove' } });
      }
    }

    return cfg;
  });
};
