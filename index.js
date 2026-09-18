/**
 * 앱 진입점 — 위젯 때문에 생겼다.
 *
 * 위젯을 누르면 앱이 꺼져 있어도 안드로이드가 이 파일을 로드한 뒤 헤드리스로
 * 태스크 핸들러를 부른다. 그래서 진입점이 `expo-router/entry` 하나일 수 없고,
 * 여기서 핸들러를 같이 등록한다(`package.json` 의 `main` 이 이 파일을 가리킨다).
 *
 * 🔑 **import 가 아니라 require 인 이유**: ES `import` 는 호이스팅돼 파일에 적힌
 * 순서대로 돌지 않는다. 앱 번들을 불러오는 데 걸린 시간을 재려면 시각을 그 앞뒤로
 * 직접 찍어야 하는데, import 로는 그 자리가 보장되지 않는다. 위젯 첫 탭이 몇 초인지가
 * 이 기능의 관문이라(뜻을 가렸다 탭으로 공개하는 화면이 거기에 달렸다) 측정이 곧 설계다.
 */
globalThis.__WIDGET_ENTRY_START = Date.now();
require('expo-router/entry');
globalThis.__WIDGET_ENTRY_READY = Date.now();

const { Platform } = require('react-native');

// 안드로이드 전용 네이티브 모듈이라 iOS 에서는 require 조차 하지 않는다 —
// 없는 네이티브 모듈은 import 하는 것만으로 던진다.
if (Platform.OS === 'android') {
  const { registerWidgetTaskHandler } = require('react-native-android-widget');
  const { widgetTaskHandler } = require('./features/widget/task-handler');
  registerWidgetTaskHandler(widgetTaskHandler);
}
