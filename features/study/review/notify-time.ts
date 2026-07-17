/**
 * 복습 알림 시각 선택 — 순수 헬퍼(§8.3).
 *
 * 네이티브 시간 선택기(@react-native-community/datetimepicker)를 쓰지 않는 이유:
 * 설정 한 줄을 위해 네이티브 의존성을 늘리면 빌드 리스크가 붙는다. 앱은 이미 언어·시작화면
 * 설정에서 `ModalPicker` 목록 방식을 쓰고 있어 그쪽이 일관되기도 하다.
 *
 * 30분 간격 48개: 사람은 알림을 "8시" 또는 "8시 30분"으로 정하지 8시 17분으로 정하지 않는다.
 *
 * ⚠️ 밤 시간대를 빼지 않는다(§8.2). 조용한 시간은 iOS 집중 모드 / Android 방해 금지가
 * 담당한다 — 앱이 새벽 학습자에게 "그 시간은 못 고릅니다"라고 참견하면 안 된다.
 */

export interface ReviewTimeOption {
  id: string;
  hour: number;
  minute: number;
}

/** `HH:mm` — 저장값이 아니라 picker 선택 식별자로만 쓴다. */
export function reviewTimeId(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function parseReviewTimeId(id: string): { hour: number; minute: number } {
  const [h, m] = id.split(':').map(Number);
  return { hour: h, minute: m };
}

export const REVIEW_TIME_OPTIONS: ReviewTimeOption[] = Array.from({ length: 48 }, (_, i) => {
  const hour = Math.floor(i / 2);
  const minute = i % 2 === 0 ? 0 : 30;
  return { id: reviewTimeId(hour, minute), hour, minute };
});

/**
 * 사람이 읽는 시각. 한국어는 "오후 8:00", 영어는 "8:00 PM" — 24시간제 지역 사용자를 위해
 * Intl에 맡기지 않고 로케일 분기만 최소로 둔다(앱 UI 언어는 ko/en 둘뿐).
 */
export function formatReviewTime(hour: number, minute: number, locale: string): string {
  const mm = String(minute).padStart(2, '0');
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  if (locale.startsWith('ko')) {
    return `${hour < 12 ? '오전' : '오후'} ${h12}:${mm}`;
  }
  return `${h12}:${mm} ${hour < 12 ? 'AM' : 'PM'}`;
}
