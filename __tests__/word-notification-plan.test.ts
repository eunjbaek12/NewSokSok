/**
 * 시간마다 단어 알림 — 계획 모듈. 설계: docs/word-notifications-design.md §8.
 *
 * 시각은 전부 폰의 달력일 기준이라 `new Date(y, m, d, h, min)` 로 만든다(UTC 숫자로 박으면
 * 테스트를 도는 기계의 시간대에 따라 결과가 달라진다).
 */
import type { VocaList, Word } from '../lib/types';
import {
  dailyMinutes,
  upcomingFireTimes,
  resolveSourceList,
  selectCandidates,
  replayDelivered,
  planWordNotifications,
  WORD_NOTIF_SLOTS,
  EMPTY_WORD_NOTIF_STATE,
  type WordNotifState,
} from '../features/study/word-notifications/plan';
import { WordNotificationSettingsSchema, type WordNotificationSettings } from '../shared/contracts';

const at = (d: number, h: number, m = 0) => new Date(2026, 8, d, h, m, 0, 0).getTime();

function word(id: string, extra: Partial<Word> = {}): Word {
  return {
    id,
    term: id,
    definition: '',
    exampleEn: '',
    meaningKr: `뜻-${id}`,
    isMemorized: false,
    isStarred: false,
    tags: [],
    ...extra,
  };
}

function list(id: string, words: Word[], extra: Partial<VocaList> = {}): VocaList {
  return { id, title: id, words, isVisible: true, createdAt: 0, ...extra };
}

const words = (n: number, prefix = 'w') => Array.from({ length: n }, (_, i) => word(`${prefix}${i}`));

function settings(extra: Partial<WordNotificationSettings> = {}): WordNotificationSettings {
  return { ...WordNotificationSettingsSchema.parse({}), enabled: true, ...extra };
}

const ids = (plan: ReturnType<typeof planWordNotifications>) => plan.notifications.map(n => n.word?.id ?? 'STOP');

describe('dailyMinutes — 하루 안의 시각', () => {
  it('9~21시 · 5번 → 9 / 12 / 15 / 18 / 21시', () => {
    expect(dailyMinutes(540, 1260, 5)).toEqual([540, 720, 900, 1080, 1260]);
  });

  it('1번이면 시간대의 가운데', () => {
    expect(dailyMinutes(540, 1260, 1)).toEqual([900]);
  });

  it('분 단위로 내린다 — 좁은 시간대 · 12번에서도 같은 시각이 겹치지 않는다', () => {
    const m = dailyMinutes(540, 570, 12);
    expect(m).toHaveLength(12);
    expect(new Set(m).size).toBe(12);
    expect(m[0]).toBe(540);
    expect(m[11]).toBe(570);
  });

  it('시작 ≥ 끝인 옛 값은 기본 9~21시로', () => {
    expect(dailyMinutes(1260, 540, 5)).toEqual([540, 720, 900, 1080, 1260]);
  });
});

describe('upcomingFireTimes — 지난 시각은 건너뛴다', () => {
  it('오전 10시에 예약하면 오늘은 12시부터', () => {
    const times = upcomingFireTimes(at(17, 10), settings(), 1);
    expect(times).toEqual([at(17, 12), at(17, 15), at(17, 18), at(17, 21)]);
  });

  it('달력일 기준 — 다음 날도 9시', () => {
    const times = upcomingFireTimes(at(17, 22), settings(), 2);
    expect(times[0]).toBe(at(18, 9));
  });
});

describe('칸 수', () => {
  it('하루 5번이면 단어 48칸 + 마지막 다음 칸에 «곧 멈춰요» 1칸', () => {
    const plan = planWordNotifications({
      lists: [list('L', words(200))],
      settings: settings(),
      state: EMPTY_WORD_NOTIF_STATE,
      now: at(17, 8),
    });
    const wordsOnly = plan.notifications.filter(n => n.word);
    expect(wordsOnly).toHaveLength(WORD_NOTIF_SLOTS);
    const stop = plan.notifications[plan.notifications.length - 1];
    expect(stop.word).toBeNull();
    // 48칸 = 9일 + 3번 → 마지막 단어는 26일 15시, 안내는 그다음 칸인 26일 18시
    expect(wordsOnly[wordsOnly.length - 1].fireAt).toBe(at(26, 15));
    expect(stop.fireAt).toBe(at(26, 18));
  });

  it('하루 3번 이하면 14일에서 먼저 끝나고, 안내는 15일째 첫 칸', () => {
    const plan = planWordNotifications({
      lists: [list('L', words(200))],
      settings: settings({ perDay: 1 }),
      state: EMPTY_WORD_NOTIF_STATE,
      now: at(17, 8),
    });
    expect(plan.notifications.filter(n => n.word)).toHaveLength(14);
    expect(plan.notifications[14].word).toBeNull();
    expect(plan.notifications[14].fireAt).toBe(at(17 + 14, 15));
  });
});

describe('순서 — 단어장 순서대로, 안 외운 단어부터', () => {
  it('오답·별표가 순서를 바꾸지 않는다', () => {
    const ws = [word('a'), word('b', { wrongCount: 9 }), word('c', { isStarred: true }), word('d')];
    const plan = planWordNotifications({
      lists: [list('L', ws)],
      settings: settings({ perDay: 4 }),
      state: EMPTY_WORD_NOTIF_STATE,
      now: at(17, 8),
    });
    expect(ids(plan).slice(0, 4)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('학습 계획이 있어도 Day 로 자르지 않는다 — Day 1~2를 외웠으면 Day 3 단어부터 이어서 Day 4로', () => {
    // 하루 3개 계획
    const ws = Array.from({ length: 12 }, (_, i) =>
      word(`d${Math.floor(i / 3) + 1}-${i % 3}`, { assignedDay: Math.floor(i / 3) + 1, isMemorized: i < 6 }),
    );
    const plan = planWordNotifications({
      lists: [list('L', ws, { planTotalDays: 4, planCurrentDay: 3 })],
      settings: settings(),
      state: EMPTY_WORD_NOTIF_STATE,
      now: at(17, 8),
    });
    expect(ids(plan).slice(0, 5)).toEqual(['d3-0', 'd3-1', 'd3-2', 'd4-0', 'd4-1']);
  });
});

describe('한 바퀴 (N7 · N8)', () => {
  it('12개 · 5번 → 사흘째 세 번째 칸부터 처음 단어, 그 칸이 새 바퀴의 시작', () => {
    const plan = planWordNotifications({
      lists: [list('L', words(12))],
      settings: settings(),
      state: EMPTY_WORD_NOTIF_STATE,
      now: at(17, 8),
    });
    const got = ids(plan);
    expect(got.slice(10, 14)).toEqual(['w10', 'w11', 'w0', 'w1']);
    expect(plan.nextState.slots[12].roundStart).toBe(true);
    expect(plan.nextState.slots.filter(s => s.roundStart)).toHaveLength(3); // 48칸 = 4바퀴
  });

  it('이틀 뒤 다시 예약하면 나간 10칸을 되짚어 11번째 단어부터', () => {
    const lists = [list('L', words(12))];
    const first = planWordNotifications({ lists, settings: settings(), state: EMPTY_WORD_NOTIF_STATE, now: at(17, 8) });
    const again = planWordNotifications({ lists, settings: settings(), state: first.nextState, now: at(19, 8) });
    expect(ids(again).slice(0, 3)).toEqual(['w10', 'w11', 'w0']);
  });

  it('«새 바퀴» 칸이 이미 나갔으면 비워진 집합에서 이어진다', () => {
    const lists = [list('L', words(12))];
    const first = planWordNotifications({ lists, settings: settings(), state: EMPTY_WORD_NOTIF_STATE, now: at(17, 8) });
    // 19일 16시: 17·18일 10칸 + 19일 9·12·15시 3칸 = 13칸 나감. 13번째(w0)가 새 바퀴 시작.
    const { sent } = replayDelivered(first.nextState, at(19, 16));
    expect([...sent]).toEqual(['w0']);
    const again = planWordNotifications({ lists, settings: settings(), state: first.nextState, now: at(19, 16) });
    expect(ids(again)[0]).toBe('w1');
  });

  it('그사이 외운 단어는 빠진다', () => {
    const ws = words(12);
    const first = planWordNotifications({ lists: [list('L', ws)], settings: settings(), state: EMPTY_WORD_NOTIF_STATE, now: at(17, 8) });
    const learned = ws.map((w, i) => (i < 3 ? { ...w, isMemorized: true } : w));
    const again = planWordNotifications({ lists: [list('L', learned)], settings: settings(), state: first.nextState, now: at(17, 8) });
    expect(ids(again)[0]).toBe('w3');
    expect(ids(again)).not.toContain('w0');
  });

  it('단어가 하루 횟수보다 적어도 막지 않는다(N14) — 3개가 번갈아 온다', () => {
    const plan = planWordNotifications({
      lists: [list('L', words(3))],
      settings: settings(),
      state: EMPTY_WORD_NOTIF_STATE,
      now: at(17, 8),
    });
    expect(ids(plan).slice(0, 5)).toEqual(['w0', 'w1', 'w2', 'w0', 'w1']);
  });

  it('저장하는 집합은 지금 후보로만 좁힌다', () => {
    const state: WordNotifState = { sent: ['gone', 'w0'], slots: [], stopNoticeSent: false };
    const plan = planWordNotifications({ lists: [list('L', words(5))], settings: settings(), state, now: at(17, 8) });
    expect(plan.nextState.sent).toEqual(['w0']);
  });
});

describe('보낼 단어가 0일 때 (N11)', () => {
  const learnedAll = [list('L', words(4).map(w => ({ ...w, isMemorized: true })))];

  it('단어 알림은 없고 «곧 멈춰요» 안내 1개만 다음 첫 칸에', () => {
    const plan = planWordNotifications({ lists: learnedAll, settings: settings(), state: EMPTY_WORD_NOTIF_STATE, now: at(17, 10) });
    expect(plan.notifications).toEqual([{ fireAt: at(17, 12), word: null, listId: null }]);
  });

  it('안내가 이미 나갔으면 아무것도 잡지 않는다 — 앱을 열 때마다 또 오지 않게', () => {
    const first = planWordNotifications({ lists: learnedAll, settings: settings(), state: EMPTY_WORD_NOTIF_STATE, now: at(17, 10) });
    const again = planWordNotifications({ lists: learnedAll, settings: settings(), state: first.nextState, now: at(17, 13) });
    expect(again.notifications).toEqual([]);
    expect(again.nextState.stopNoticeSent).toBe(true);
  });

  it('후보가 다시 생기면 기억을 지운다', () => {
    const first = planWordNotifications({ lists: learnedAll, settings: settings(), state: EMPTY_WORD_NOTIF_STATE, now: at(17, 10) });
    const quiet = planWordNotifications({ lists: learnedAll, settings: settings(), state: first.nextState, now: at(17, 13) });
    const back = planWordNotifications({ lists: [list('L', words(4))], settings: settings(), state: quiet.nextState, now: at(17, 13) });
    expect(back.notifications[0].word?.id).toBe('w0');
    expect(back.nextState.stopNoticeSent).toBe(false);
  });
});

describe('출처 단어장', () => {
  it('자동 = 가장 최근에 공부한 단어장', () => {
    const lists = [
      list('top', words(3, 'a'), { lastStudiedAt: 100 }),
      list('recent', words(3, 'b'), { lastStudiedAt: 500 }),
    ];
    expect(resolveSourceList(lists, null)).toEqual({ list: lists[1], auto: true });
  });

  it('학습 기록이 없으면 단어장 탭 맨 위 — 빈 단어장은 건너뛴다', () => {
    const lists = [list('empty', []), list('first', words(2)), list('second', words(2))];
    expect(resolveSourceList(lists, null).list?.id).toBe('first');
  });

  it('숨긴 단어장은 자동에서도, 고른 값에서도 빠진다 — 고른 단어장을 숨기면 자동으로', () => {
    const lists = [
      list('hidden', words(3, 'h'), { isVisible: false, lastStudiedAt: 900 }),
      list('shown', words(3, 's'), { lastStudiedAt: 100 }),
    ];
    expect(resolveSourceList(lists, null).list?.id).toBe('shown');
    expect(resolveSourceList(lists, 'hidden')).toEqual({ list: lists[1], auto: true });
  });

  it('고른 단어장이 보이면 그것', () => {
    const lists = [list('a', words(1), { lastStudiedAt: 900 }), list('b', words(1))];
    expect(resolveSourceList(lists, 'b')).toEqual({ list: lists[1], auto: false });
  });

  it('고른 단어장이 지워졌으면 자동으로', () => {
    const lists = [list('a', words(1))];
    expect(resolveSourceList(lists, 'deleted')).toEqual({ list: lists[0], auto: true });
  });
});

describe('조건 — «골라서 학습»과 같은 집합, 단어장 순서', () => {
  const ws = [
    word('a', { wrongCount: 1 }),
    word('b', { isMemorized: true, isStarred: true }),
    word('c', { wrongCount: 5, isStarred: true }),
    word('d'),
  ];
  const L = list('L', ws);

  it('미암기', () => {
    expect(selectCandidates(L, { wordFilter: 'learning', starredOnly: false }).map(w => w.id)).toEqual(['a', 'c', 'd']);
  });

  it('암기 + 별표', () => {
    expect(selectCandidates(L, { wordFilter: 'memorized', starredOnly: true }).map(w => w.id)).toEqual(['b']);
  });

  it('많이 틀린 50 — 틀린 적 있는 단어만, 순서는 단어장 순서로 되돌린다', () => {
    expect(selectCandidates(L, { wordFilter: 'wrongCount', starredOnly: false }).map(w => w.id)).toEqual(['a', 'c']);
  });

  it('최근 추가 50 — 51개면 가장 오래된 하나가 빠진다', () => {
    const many = Array.from({ length: 51 }, (_, i) => word(`r${i}`, { createdAt: i }));
    const got = selectCandidates(list('R', many), { wordFilter: 'recent', starredOnly: false }).map(w => w.id);
    expect(got).toHaveLength(50);
    expect(got).not.toContain('r0');
    expect(got[0]).toBe('r1');
  });
});
