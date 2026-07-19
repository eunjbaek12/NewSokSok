/**
 * 복습 알림 스케줄 계획 — 순수 모듈. 설계: docs/gentle-srs-design.md §8.1.
 *
 * ## 왜 "매일 반복 알림"이 아닌가 (이 파일의 존재 이유)
 *
 * 설계는 **"due = 0이면 보내지 않는다"** 를 요구한다. 그런데 로컬 알림은 OS가 미리 잡아두고
 * 발사하는 구조라, 저녁 8시에 우리 코드가 깨어나 "오늘 복습할 게 있나?"를 확인할 방법이 없다.
 * 매일 반복(daily repeating) 트리거 하나로 끝내면 복습할 게 없는 날에도 부르게 되어
 * "복습할 단어가 없는 날은 보내지 않아요"(§8.3의 약속)가 거짓말이 된다.
 *
 * 그래서 **미래의 due를 미리 계산해, 실제로 복습거리가 있을 날짜만 골라 일정을 잡는다.**
 *
 * ## 이 예측이 왜 맞는가
 *
 * due는 `isMemorized` · `lastReviewedAt` · `reviewSuccessCount` 세 값만으로 결정되고,
 * 그 값들은 **학습해야만 바뀐다.** 따라서 사용자가 앱을 안 열면 예측은 근사가 아니라 **정확**하다
 * (시간이 흐르면 due는 늘기만 한다). 학습을 하면 그 순간 앱이 켜져 있으므로 다시 계획하면 된다.
 *
 * 어긋날 수 있는 유일한 경우는 **다른 기기에서 학습**했을 때(동기화로 내려오기 전)인데,
 * 그때도 "복습거리가 없는데 부르는" 쪽으로만 틀리고 pull 이후 스스로 교정된다.
 */
import type { VocaList } from '@/lib/types';
import { selectReviewWords } from './engine';

/**
 * 며칠 앞까지 일정을 잡아둘까.
 *
 * 하나만 잡으면 안 된다: 알림의 목적이 **앱을 안 여는 사용자를 데려오는 것**인데, 첫 알림이
 * 발사된 뒤 앱을 안 열면 다음 일정을 잡아줄 사람이 없어 영영 조용해진다.
 * 14일이면 2주간 앱을 안 열어도 매일 부른다. iOS 대기 알림 상한이 64개라 여유도 충분하다.
 */
export const REVIEW_NOTIF_LOOKAHEAD_DAYS = 14;

export interface PlannedReviewNotification {
  /** 발사 시각(epoch ms). 기기 로컬 시간대 기준 그날의 hour:minute. */
  fireAt: number;
  /** 그날 보여줄 복습 개수 — 이미 상한(20)이 적용된 수라 총량이 새지 않는다(P1). */
  count: number;
}

export interface ReviewNotifyTime {
  hour: number;
  minute: number;
}

/**
 * 앞으로 며칠간 실제로 복습거리가 생길 날짜와 그날의 개수를 계산한다.
 *
 * - 이미 지난 시각은 건너뛴다(오늘 8시가 지났으면 오늘은 없음).
 * - due = 0인 날은 아예 넣지 않는다(§8.1).
 * - 개수는 `selectReviewWords`가 주는 상한 적용 값 — 알림 문구와 홈 배너가 같은 수를 말한다.
 */
export function planReviewNotifications(
  lists: VocaList[],
  now: number,
  time: ReviewNotifyTime,
  lookaheadDays: number = REVIEW_NOTIF_LOOKAHEAD_DAYS,
): PlannedReviewNotification[] {
  const planned: PlannedReviewNotification[] = [];
  const base = new Date(now);

  for (let offset = 0; offset <= lookaheadDays; offset++) {
    // 로컬 달력일 기준으로 만든다 — DST가 있는 지역에서도 "그날 저녁 8시"가 유지된다.
    const fire = new Date(
      base.getFullYear(), base.getMonth(), base.getDate() + offset,
      time.hour, time.minute, 0, 0,
    );
    const fireAt = fire.getTime();
    if (fireAt <= now) continue;

    const count = selectReviewWords(lists, fireAt).length;
    if (count === 0) continue;

    planned.push({ fireAt, count });
  }

  return planned;
}
