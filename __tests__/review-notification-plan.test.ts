import {
  planReviewNotifications,
  REVIEW_NOTIF_LOOKAHEAD_DAYS,
} from '../features/study/review/notification-plan';
import { REVIEW_DAILY_CAP } from '../features/study/review/engine';
import type { Word, VocaList } from '../lib/types';

const DAY = 86400000;
/** 2026-07-20(월) 정오. */
const NOW = new Date(2026, 6, 20, 12).getTime();
const daysAgo = (n: number) => NOW - n * DAY;
const EVENING = { hour: 20, minute: 0 };

const word = (over: Partial<Word> = {}): Word => ({
  id: 'w1', term: 'apple', definition: '', exampleEn: '', meaningKr: '사과',
  isMemorized: true, isStarred: false, tags: [], wrongCount: 0,
  reviewSuccessCount: 1, lastReviewedAt: daysAgo(1),
  ...over,
});

const list = (words: Word[]): VocaList => ({
  id: 'l1', title: '단어장', words, isVisible: true, createdAt: 0,
});

/** 계획된 발사 시각을 'YYYY-MM-DD HH:mm'으로 (로컬). */
const at = (ms: number) => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

describe('planReviewNotifications', () => {
  test('복습거리가 없으면 아무것도 잡지 않는다 — 빈 날 부르지 않기(§8.1)', () => {
    // 3일 간격 단어를 어제 봤다 → 앞으로 이틀은 due가 아니다.
    // (3일째부터는 due가 되므로 lookahead를 2일로 제한해 확인)
    const plan = planReviewNotifications([list([word({ lastReviewedAt: daysAgo(1) })])], NOW, EVENING, 1);
    expect(plan).toEqual([]);
  });

  test('단어가 하나도 없으면 빈 계획', () => {
    expect(planReviewNotifications([], NOW, EVENING)).toEqual([]);
    expect(planReviewNotifications([list([])], NOW, EVENING)).toEqual([]);
  });

  test('due가 되는 날부터 잡는다', () => {
    // 3일 간격 · 어제 학습 → 2일 뒤(7/22)부터 due.
    const plan = planReviewNotifications([list([word({ lastReviewedAt: daysAgo(1) })])], NOW, EVENING, 3);
    expect(plan.map(p => at(p.fireAt))).toEqual([
      '2026-07-22 20:00',
      '2026-07-23 20:00',
    ]);
  });

  test('이미 지난 시각은 건너뛴다 — 오늘 저녁 8시가 지났으면 오늘은 없음', () => {
    const tonight9pm = new Date(2026, 6, 20, 21).getTime();
    const plan = planReviewNotifications(
      [list([word({ lastReviewedAt: daysAgo(30) })])], tonight9pm, EVENING, 1,
    );
    expect(plan.map(p => at(p.fireAt))).toEqual(['2026-07-21 20:00']);
  });

  test('아직 안 지났으면 오늘 저녁도 잡는다', () => {
    const today3pm = new Date(2026, 6, 20, 15).getTime();
    const plan = planReviewNotifications(
      [list([word({ lastReviewedAt: daysAgo(30) })])], today3pm, EVENING, 0,
    );
    expect(plan.map(p => at(p.fireAt))).toEqual(['2026-07-20 20:00']);
  });

  test('설정한 시간에 발사한다', () => {
    const plan = planReviewNotifications(
      [list([word({ lastReviewedAt: daysAgo(30) })])], NOW, { hour: 7, minute: 30 }, 1,
    );
    expect(at(plan[0].fireAt)).toBe('2026-07-21 07:30');
  });

  test('개수는 상한(20)이 적용된 수 — 알림에 "543개"가 새지 않는다(P1)', () => {
    const many = Array.from({ length: 300 }, (_, i) =>
      word({ id: `w${i}`, lastReviewedAt: daysAgo(60) }),
    );
    const plan = planReviewNotifications([list(many)], NOW, EVENING, 1);
    expect(plan[0].count).toBe(REVIEW_DAILY_CAP);
  });

  test('앱을 2주간 안 열어도 매일 부른다 — 첫 알림 후 조용해지지 않게', () => {
    const plan = planReviewNotifications([list([word({ lastReviewedAt: daysAgo(30) })])], NOW, EVENING);
    // 오늘 8시는 이미 지났으므로(정오 기준 아직 안 지남) 오늘 포함 15일.
    expect(plan).toHaveLength(REVIEW_NOTIF_LOOKAHEAD_DAYS + 1);
    expect(at(plan[0].fireAt)).toBe('2026-07-20 20:00');
    expect(at(plan[plan.length - 1].fireAt)).toBe('2026-08-03 20:00');
  });

  test('은퇴한 단어는 알림을 만들지 않는다', () => {
    const retired = word({ reviewSuccessCount: 7, lastReviewedAt: daysAgo(9999) });
    expect(planReviewNotifications([list([retired])], NOW, EVENING)).toEqual([]);
  });

  test('미암기 단어는 알림을 만들지 않는다', () => {
    const learning = word({ isMemorized: false, lastReviewedAt: daysAgo(60) });
    expect(planReviewNotifications([list([learning])], NOW, EVENING)).toEqual([]);
  });

  test('숨긴 단어장은 부르지 않는다', () => {
    const hidden: VocaList = { ...list([word({ lastReviewedAt: daysAgo(30) })]), isVisible: false };
    expect(planReviewNotifications([hidden], NOW, EVENING)).toEqual([]);
  });

  test('날이 갈수록 개수가 늘어난다 — 학습하지 않으면 due는 쌓이기만 한다', () => {
    // 서로 다른 날 due가 되는 단어 3개.
    const words = [
      word({ id: 'a', lastReviewedAt: daysAgo(2) }), // 내일 due
      word({ id: 'b', lastReviewedAt: daysAgo(1) }), // 모레 due
      word({ id: 'c', lastReviewedAt: NOW }),        // 3일 뒤 due
    ];
    const plan = planReviewNotifications([list(words)], NOW, EVENING, 3);
    expect(plan.map(p => ({ day: at(p.fireAt).slice(8, 10), count: p.count }))).toEqual([
      { day: '21', count: 1 },
      { day: '22', count: 2 },
      { day: '23', count: 3 },
    ]);
  });
});
