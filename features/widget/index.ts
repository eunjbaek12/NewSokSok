// 🔴 이 배럴은 앱 어디서 import 해도 안전해야 한다 — 네이티브 위젯 모듈을 정적으로 끌어오는
//    것(task-handler · WordWidget)은 여기서 내보내지 않는다. iOS 에서는 import 하는 것만으로
//    죽을 수 있다. 헤드리스 핸들러는 진입점(index.js)이 안드로이드에서만 직접 불러 등록한다.
export {
  pickWidgetContent,
  resolveSourceList,
  WIDGET_NEW_DAILY_CAP,
  WIDGET_REVIEW_DAILY_CAP,
  type WidgetContent,
  type WidgetMode,
} from './next-word';
export { useWidgetRefreshOnLeave, refreshWidgets, WIDGET_NAME } from './refresh';
