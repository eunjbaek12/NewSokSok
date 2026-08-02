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

import { localeTag } from '@/i18n/locale';

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
 * 사람이 읽는 시각. 한국어는 "오전 8:00", 영어는 "8:00 AM".
 *
 * `hour12: true`를 명시하는 이유: 24시간제가 기본인 지역(en-GB 등)에서도 이 화면은
 * 12시간제로 통일한다 — 목록 48개가 오전/오후로 갈려 있어야 훑기 쉽다. 이건 원래
 * 코드가 로케일 분기를 손으로 짠 이유이기도 한데, **분기까지 손으로 짤 필요는 없다**:
 * 오전/오후 단어와 그 위치(한국어는 앞, 영어는 뒤, 일본어는 앞에 붙여 씀)는 Intl이 안다.
 * 세 번째 언어를 추가할 때 이 함수는 손댈 것이 없다.
 *
 * Intl.DateTimeFormat은 이미 프로덕션에서 쓰고 있다(app/contact.tsx·whats-new.tsx의
 * toLocaleDateString) — Hermes에서 동작이 확인된 경로다. 그래도 로케일 데이터가 없는
 * 런타임을 만나면 포맷터가 던지므로, 영어식 표기로 떨어뜨린다.
 */
export function formatReviewTime(hour: number, minute: number, locale: string): string {
  const mm = String(minute).padStart(2, '0');
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  try {
    // 날짜 부분은 버리고 시:분만 쓴다. 1970-01-01 로컬 자정 기준으로 시각만 얹는다.
    const ref = new Date(1970, 0, 1, hour, minute);
    return new Intl.DateTimeFormat(localeTag(locale), {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(ref);
  } catch {
    return `${h12}:${mm} ${hour < 12 ? 'AM' : 'PM'}`;
  }
}
