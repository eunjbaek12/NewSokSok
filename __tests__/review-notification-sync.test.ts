/**
 * syncReviewNotifications의 **겹침 안전성**을 지킨다.
 *
 * 이 함수는 "전량 취소 후 전량 재등록"이라, 한 번 실행이 취소 1회 + 등록 최대 15회를
 * 순차 await하는 긴 작업이다. 호출부(홈 화면)는 학습 커밋·동기화 pull·단어 편집마다
 * 이걸 부르므로 실제로 겹친다. 직렬화가 없으면 두 실행의 cancel/schedule이 교차해
 * **같은 날 알림이 두 번 울리거나 통째로 사라진다** — 둘 다 조용한 실패다.
 *
 * 그래서 여기서는 mock에 일부러 지연을 넣어 교차를 강제한다. 지연이 없으면 await가
 * 즉시 풀려 버그가 재현되지 않고, 테스트가 통과하면서 아무것도 지키지 못한다.
 */
import type { VocaList, Word } from '../lib/types';

/** OS의 대기 알림 목록을 흉내낸다. 등록·취소마다 한 틱씩 쉬어 교차 기회를 만든다. */
const scheduled: { identifier: string; content: { data: any } }[] = [];
let nextId = 0;
const tick = () => new Promise(r => setImmediate(r));

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  SchedulableTriggerInputTypes: { DATE: 'date' },
  AndroidImportance: { DEFAULT: 3 },
  setNotificationChannelAsync: jest.fn(async () => {}),
  getPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  getAllScheduledNotificationsAsync: jest.fn(async () => {
    await tick();
    return [...scheduled];
  }),
  scheduleNotificationAsync: jest.fn(async (req: any) => {
    await tick();
    const identifier = `n${nextId++}`;
    scheduled.push({ identifier, content: req.content });
    return identifier;
  }),
  cancelScheduledNotificationAsync: jest.fn(async (id: string) => {
    await tick();
    const i = scheduled.findIndex(n => n.identifier === id);
    if (i >= 0) scheduled.splice(i, 1);
  }),
}));

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('@/i18n', () => ({ __esModule: true, default: { t: (k: string) => k } }));

const { syncReviewNotifications, REVIEW_NOTIFICATION_KIND } = require('../features/study/review/notifications');

const DAY = 86400000;
const NOW = new Date(2026, 6, 17, 9, 0, 0).getTime(); // 로컬 오전 9시 — 그날 저녁 8시가 아직 남았다
const SETTINGS = { enabled: true, hour: 20, minute: 0, softAsked: true };

/** 오래전에 외운 암기 단어 — 넣는 즉시 계속 due라 lookahead 전 날짜에 알림이 잡힌다. */
function dueWord(id: string): Word {
  return {
    id,
    term: id,
    definition: '',
    exampleEn: '',
    meaningKr: '뜻',
    isStarred: false,
    tags: [],
    isMemorized: true,
    lastReviewedAt: NOW - 90 * DAY,
    reviewSuccessCount: 1,
  };
}

function listOf(...ids: string[]): VocaList[] {
  return [{ id: 'l1', title: '단어장', isVisible: true, words: ids.map(dueWord) } as VocaList];
}

const ours = () => scheduled.filter(n => n.content.data?.kind === REVIEW_NOTIFICATION_KIND);

beforeEach(() => {
  scheduled.length = 0;
  nextId = 0;
});

describe('syncReviewNotifications — 겹쳐 불러도 안전하다', () => {
  test('단독 실행은 due가 있는 날마다 하나씩 건다', async () => {
    const n = await syncReviewNotifications(listOf('a'), SETTINGS, NOW);
    expect(n).toBeGreaterThan(0);
    expect(ours()).toHaveLength(n);
  });

  test('await 없이 연달아 두 번 불러도 알림이 중복되지 않는다', async () => {
    // 이것이 실제 시나리오다: 학습 커밋 → lists 변경 → 재예약이 도는 중에 pull이 또 바꾼다.
    const first = syncReviewNotifications(listOf('a'), SETTINGS, NOW);
    const second = syncReviewNotifications(listOf('a', 'b'), SETTINGS, NOW);
    const [, n2] = await Promise.all([first, second]);

    // 직렬화가 없으면 두 실행의 등록이 뒤섞여 개수가 부풀어 오른다.
    expect(ours()).toHaveLength(n2);
  });

  test('여러 번 몰아쳐도 최종 상태는 마지막 요청 하나와 같다', async () => {
    const runs = [
      syncReviewNotifications(listOf('a'), SETTINGS, NOW),
      syncReviewNotifications(listOf('a', 'b'), SETTINGS, NOW),
      syncReviewNotifications(listOf('a', 'b', 'c'), SETTINGS, NOW),
    ];
    await Promise.all(runs);
    const afterBurst = ours().length;

    scheduled.length = 0;
    const alone = await syncReviewNotifications(listOf('a', 'b', 'c'), SETTINGS, NOW);
    expect(afterBurst).toBe(alone);
  });

  test('밀린 요청은 건너뛴다 — 마지막 것만 실제로 일한다', async () => {
    const Notifications = require('expo-notifications');
    const before = Notifications.scheduleNotificationAsync.mock.calls.length;

    await Promise.all([
      syncReviewNotifications(listOf('a'), SETTINGS, NOW),
      syncReviewNotifications(listOf('a'), SETTINGS, NOW),
      syncReviewNotifications(listOf('a'), SETTINGS, NOW),
    ]);
    const burstCalls = Notifications.scheduleNotificationAsync.mock.calls.length - before;

    // 3번 전부 일했다면 등록 호출이 3배로 찍힌다. coalesce가 있으면 1회분만 나온다.
    expect(burstCalls).toBe(ours().length);
  });

  test('마지막 요청이 끄기면 결과도 꺼진 상태 — 앞선 요청이 되살리지 않는다', async () => {
    await syncReviewNotifications(listOf('a'), SETTINGS, NOW);
    expect(ours().length).toBeGreaterThan(0);

    const on = syncReviewNotifications(listOf('a'), SETTINGS, NOW);
    const off = syncReviewNotifications(listOf('a'), { ...SETTINGS, enabled: false }, NOW);
    await Promise.all([on, off]);

    expect(ours()).toHaveLength(0);
  });

  test('남의 알림은 건드리지 않는다', async () => {
    scheduled.push({ identifier: 'other', content: { data: { kind: 'someone-else' } } });
    await syncReviewNotifications(listOf('a'), SETTINGS, NOW);
    expect(scheduled.some(n => n.identifier === 'other')).toBe(true);
  });
});
