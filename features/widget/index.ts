// 바깥에서 쓰는 것은 진입점이 등록하는 핸들러 하나뿐이다.
// 나머지(화면·상태·고르기)는 이 폴더 안에서 상대 경로로 쓴다.
export { widgetTaskHandler } from './task-handler';
export {
  pickWidgetContent,
  resolveSourceList,
  WIDGET_NEW_DAILY_CAP,
  WIDGET_REVIEW_DAILY_CAP,
  type WidgetContent,
  type WidgetMode,
} from './next-word';
