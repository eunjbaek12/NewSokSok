/**
 * syncWordNotifications — OS 쪽 래퍼. 계획 자체는 word-notification-plan.test.ts 가 지키고,
 * 여기서는 «복습 알림을 지우지 않는다»·«끄면 다 지우되 나간 단어는 기억한다»·«겹쳐 불러도
 * 중복되지 않는다»만 본다(복습 알림 sync 테스트와 같은 mock — 틱마다 쉬어 교차를 강제한다).
 */
import type { VocaList, Word } from '../lib/types';

const scheduled: { identifier: string; content: { title?: string; data: any } }[] = [];
let nextId = 0;
const tick = () => new Promise(r => setImmediate(r));
const storage = new Map<string, string>();

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

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => storage.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => { storage.set(k, v); }),
    removeItem: jest.fn(async (k: string) => { storage.delete(k); }),
  },
}));

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('@/i18n', () => ({ __esModule: true, default: { t: (k: string) => k } }));

const {
  syncWordNotifications,
  WORD_NOTIFICATION_KIND,
  WORD_NOTIFICATION_STOP_KIND,
} = require('../features/study/word-notifications/notifications');
const { WordNotificationSettingsSchema } = require('../shared/contracts');

const NOW = new Date(2026, 8, 17, 8, 0, 0).getTime();
const SETTINGS = { ...WordNotificationSettingsSchema.parse({}), enabled: true };

function w(id: string): Word {
  return { id, term: id, definition: '', exampleEn: '', meaningKr: `뜻-${id}`, isMemorized: false, isStarred: false, tags: [] };
}
const lists = (n: number): VocaList[] => [
  { id: 'L', title: 'L', isVisible: true, createdAt: 0, words: Array.from({ length: n }, (_, i) => w(`w${i}`)) },
];

const ours = () => scheduled.filter(n => n.content.data?.kind === WORD_NOTIFICATION_KIND || n.content.data?.kind === WORD_NOTIFICATION_STOP_KIND);

beforeEach(() => {
  scheduled.length = 0;
  nextId = 0;
  storage.clear();
});

describe('syncWordNotifications', () => {
  test('단어 48개 + 안내 1개를 건다 — 제목은 단어, 본문은 뜻', async () => {
    const n = await syncWordNotifications(lists(100), SETTINGS, NOW);
    expect(n).toBe(49);
    const words = ours().filter(x => x.content.data.kind === WORD_NOTIFICATION_KIND);
    expect(words).toHaveLength(48);
    expect(words[0].content.title).toBe('w0');
    expect(words[0].content.data).toEqual({ kind: WORD_NOTIFICATION_KIND, listId: 'L', wordId: 'w0' });
  });

  test('복습 알림은 건드리지 않는다', async () => {
    scheduled.push({ identifier: 'review', content: { data: { kind: 'gentle-srs-review' } } });
    await syncWordNotifications(lists(5), SETTINGS, NOW);
    await syncWordNotifications(lists(5), { ...SETTINGS, enabled: false }, NOW);
    expect(scheduled.map(x => x.identifier)).toEqual(['review']);
  });

  test('겹쳐 불러도 중복되지 않는다 — 마지막 요청 하나와 같다', async () => {
    await Promise.all([
      syncWordNotifications(lists(3), SETTINGS, NOW),
      syncWordNotifications(lists(10), SETTINGS, NOW),
      syncWordNotifications(lists(100), SETTINGS, NOW),
    ]);
    expect(ours()).toHaveLength(49);
  });

  test('껐다 켜도 이미 나간 단어는 건너뛴다', async () => {
    await syncWordNotifications(lists(100), SETTINGS, NOW);
    // 이틀 뒤(10개 나감) 끄고, 같은 날 다시 켠다.
    const later = new Date(2026, 8, 19, 8, 0, 0).getTime();
    await syncWordNotifications(lists(100), { ...SETTINGS, enabled: false }, later);
    expect(ours()).toHaveLength(0);
    await syncWordNotifications(lists(100), SETTINGS, later);
    const first = ours().find(x => x.content.data.kind === WORD_NOTIFICATION_KIND);
    expect(first?.content.data.wordId).toBe('w10');
  });
});
