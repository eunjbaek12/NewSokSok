/**
 * 시간마다 단어 알림 — 계획(순수 모듈). 설계: docs/word-notifications-design.md.
 *
 * OS 호출은 `./notifications` 가 맡고, 여기서는 «어느 시각에 어떤 단어를»만 정한다.
 *
 * ## 왜 «보낸 단어»를 기억하나 (N7)
 *
 * 알림은 미리 예약해 두는 것이라 단어가 예약 순간 굳는다. 앱은 앱을 열 때마다 전체를 다시
 * 예약하는데, 매번 후보 목록의 앞에서부터 채우면 **매일 같은 첫 다섯 단어**가 간다. 그래서
 * «이번 바퀴에 이미 나간 단어»를 들고 다니며 이어서 채운다.
 *
 * 나간 단어는 예약할 때가 아니라 **다시 예약할 때** 안다 — 지난번에 잡아 둔 칸 중 시각이
 * 지난 것이 나간 것이다. 그래서 칸마다 «여기서 새 바퀴가 시작됐나»를 적어 두고, 다시 예약할
 * 때 지난 칸을 순서대로 되짚어 집합을 복원한다.
 *
 * ## 왜 Day 로 자르지 않나 (N9)
 *
 * 계획은 단어장 순서대로 Day 를 나누고, 외운 단어는 조건(미암기)에서 빠진다. 그래서 단어장
 * 순서대로 보내기만 하면 계획이 있는 사람도 **저절로 지금 공부하는 Day 부터** 받는다.
 */
import type { VocaList, Word } from '@/lib/types';
import type { WordNotificationSettings } from '@shared/contracts';
import { collectScopeItems, selectPickResults, DEFAULT_PICK_FILTERS, type PickFilters } from '../pick/filter';

/**
 * 단어 알림이 쓰는 칸 수. iOS 는 앱당 대기 알림이 64개이고, 복습 알림이 최대 15개
 * (오늘 + 14일)를 쓴다. «곧 멈춰요» 안내 1개를 빼면 48개. 넘치면 iOS 가 늦은 것부터
 * 말없이 버린다. Android 도 같은 수로 맞춘다 — 안드로이드 실기가 iOS 동작을 대신 확인한다.
 */
export const WORD_NOTIF_SLOTS = 48;

/** 복습 알림과 같은 앞보기 — 하루 3번 이하면 칸보다 날짜가 먼저 끝난다. */
export const WORD_NOTIF_LOOKAHEAD_DAYS = 14;

const DEFAULT_START = 9 * 60;
const DEFAULT_END = 21 * 60;

/** 지난번에 잡아 둔 칸. `wordId` 가 null 이면 «곧 멈춰요» 안내. */
export interface WordNotifSlot {
  fireAt: number;
  wordId: string | null;
  /** 이 칸에서 새 바퀴가 시작됐다(집합을 비우고 넣었다). */
  roundStart: boolean;
}

/** 설정이 아니라 내부 상태 — 설정 저장소와 다른 키에 둔다. */
export interface WordNotifState {
  /** 지난번 예약 시점까지 이번 바퀴에 나간 단어. */
  sent: string[];
  /** 지난번에 잡아 둔 칸(시각 순). */
  slots: WordNotifSlot[];
  /** «곧 멈춰요» 안내가 이미 나갔다. 후보가 다시 생기면 지운다(N11 — 한 번만). */
  stopNoticeSent: boolean;
}

export const EMPTY_WORD_NOTIF_STATE: WordNotifState = { sent: [], slots: [], stopNoticeSent: false };

export interface PlannedWordNotification {
  fireAt: number;
  /** null = «곧 멈춰요» 안내 */
  word: Word | null;
  listId: string | null;
}

export interface WordNotifPlan {
  notifications: PlannedWordNotification[];
  /** 예약을 마친 뒤 저장할 상태. */
  nextState: WordNotifState;
}

/**
 * 하루 안의 발송 시각(자정 기준 분).
 * - 1번이면 시간대의 가운데, 2번 이상이면 시작과 끝을 포함해 고르게 나눈다(분 단위 내림).
 * - 시작 ≥ 끝인 값이 저장돼 있으면 기본 9~21시로 떨어뜨린다(고르기 창이 막지만 옛 값 대비).
 */
export function dailyMinutes(startMinute: number, endMinute: number, perDay: number): number[] {
  let start = startMinute;
  let end = endMinute;
  if (!(start < end)) {
    start = DEFAULT_START;
    end = DEFAULT_END;
  }
  const n = Math.max(1, Math.min(12, Math.floor(perDay)));
  if (n === 1) return [Math.floor((start + end) / 2)];
  const step = (end - start) / (n - 1);
  return Array.from({ length: n }, (_, k) => Math.floor(start + k * step));
}

/**
 * 지금 이후의 발송 시각들(오름차순). 폰의 달력일 기준이라 서머타임이 있어도 «그날 9시»다
 * (복습 알림 `planReviewNotifications` 와 같은 계산).
 */
export function upcomingFireTimes(
  now: number,
  settings: Pick<WordNotificationSettings, 'startMinute' | 'endMinute' | 'perDay'>,
  days: number,
): number[] {
  const minutes = dailyMinutes(settings.startMinute, settings.endMinute, settings.perDay);
  const base = new Date(now);
  const times: number[] = [];
  for (let offset = 0; offset < days; offset++) {
    for (const m of minutes) {
      const at = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset, 0, m, 0, 0).getTime();
      if (at > now) times.push(at);
    }
  }
  return times;
}

function hasWords(list: VocaList): boolean {
  return list.words.length > 0;
}

/**
 * 출처 단어장. 숨긴 단어장은 쓰지 않는다(앱 «복습하기»와 같게).
 * - 고른 단어장이 보이는 채로 있으면 그것.
 * - 아니면(자동 · 고른 단어장이 숨김/삭제) 가장 최근에 공부한 단어장, 기록이 없으면 단어장 탭 맨 위.
 *   빈 단어장은 건너뛴다 — 방금 만든 빈 단어장이 맨 위에 있다고 알림이 멈추면 안 된다.
 */
export function resolveSourceList(lists: VocaList[], listId: string | null): { list: VocaList | null; auto: boolean } {
  const visible = lists.filter(l => l.isVisible);
  if (listId) {
    const chosen = visible.find(l => l.id === listId);
    if (chosen) return { list: chosen, auto: false };
  }
  const withWords = visible.filter(hasWords);
  let best: VocaList | null = null;
  for (const l of withWords) {
    if ((l.lastStudiedAt ?? 0) > 0 && (!best || (l.lastStudiedAt ?? 0) > (best.lastStudiedAt ?? 0))) best = l;
  }
  return { list: best ?? withWords[0] ?? null, auto: true };
}

export function toPickFilters(list: VocaList, settings: Pick<WordNotificationSettings, 'wordFilter' | 'starredOnly'>): PickFilters {
  return {
    ...DEFAULT_PICK_FILTERS,
    wordFilter: settings.wordFilter,
    starredOnly: settings.starredOnly,
    useAllLists: false,
    selectedListIds: [list.id],
  };
}

/**
 * 조건에 맞는 단어를 **단어장 순서대로**. 집합은 «골라서 학습»과 같은 계산으로 구하고(칩 이름이
 * 같은데 다른 단어가 나오면 안 된다), 순서만 단어장 순서로 되돌린다 — 프리셋(많이 틀린·최근 추가)은
 * 정렬해서 자르므로 순서가 바뀌어 온다.
 */
export function selectCandidates(list: VocaList, settings: Pick<WordNotificationSettings, 'wordFilter' | 'starredOnly'>): Word[] {
  const filters = toPickFilters(list, settings);
  const pool = collectScopeItems([list], filters);
  const picked = new Set(selectPickResults(pool, '', filters, true).map(r => r.word.id));
  return list.words.filter(w => picked.has(w.id));
}

/** 지난 칸을 되짚어 «이번 바퀴에 나간 단어»와 «안내가 나갔나»를 복원한다. */
export function replayDelivered(state: WordNotifState, now: number): { sent: Set<string>; stopNoticeSent: boolean } {
  const sent = new Set(state.sent);
  let stopNoticeSent = state.stopNoticeSent;
  for (const slot of state.slots) {
    if (slot.fireAt > now) break;
    if (slot.wordId === null) {
      stopNoticeSent = true;
      continue;
    }
    if (slot.roundStart) sent.clear();
    sent.add(slot.wordId);
  }
  return { sent, stopNoticeSent };
}

export function planWordNotifications(input: {
  lists: VocaList[];
  settings: WordNotificationSettings;
  state: WordNotifState;
  now: number;
}): WordNotifPlan {
  const { lists, settings, state, now } = input;
  const { sent, stopNoticeSent } = replayDelivered(state, now);
  const { list } = resolveSourceList(lists, settings.listId);
  const candidates = list ? selectCandidates(list, settings) : [];
  const candidateIds = new Set(candidates.map(w => w.id));
  // 저장할 집합은 지금 후보로만 좁힌다 — 외운 단어·다른 단어장의 옛 id 가 끝없이 쌓이지 않게.
  const keptSent = [...sent].filter(id => candidateIds.has(id));

  // 발송 시각: 앞보기 날짜 안에서 칸 수까지 + 안내가 들어갈 다음 칸 하나.
  const times = upcomingFireTimes(now, settings, WORD_NOTIF_LOOKAHEAD_DAYS + 1);

  if (candidates.length === 0) {
    // 보낼 단어가 없다 — 안내만 한 번(N11). 이미 나갔으면 아무것도 잡지 않는다.
    if (stopNoticeSent || times.length === 0) {
      return { notifications: [], nextState: { sent: keptSent, slots: [], stopNoticeSent } };
    }
    const slot: WordNotifSlot = { fireAt: times[0], wordId: null, roundStart: false };
    return {
      notifications: [{ fireAt: slot.fireAt, word: null, listId: null }],
      nextState: { sent: keptSent, slots: [slot], stopNoticeSent: false },
    };
  }

  const wordTimes = upcomingFireTimes(now, settings, WORD_NOTIF_LOOKAHEAD_DAYS).slice(0, WORD_NOTIF_SLOTS);
  const round = new Set(keptSent);
  const slots: WordNotifSlot[] = [];
  const notifications: PlannedWordNotification[] = [];
  let cursor = 0;

  for (const fireAt of wordTimes) {
    let roundStart = false;
    if (round.size >= candidates.length) {
      // 한 바퀴를 다 보냈다 — 처음부터(N8). 외운 단어는 이미 후보에서 빠져 있다.
      round.clear();
      cursor = 0;
      roundStart = true;
    }
    while (round.has(candidates[cursor].id)) cursor++;
    const word = candidates[cursor];
    round.add(word.id);
    cursor++;
    slots.push({ fireAt, wordId: word.id, roundStart });
    notifications.push({ fireAt, word, listId: list!.id });
  }

  // 안내는 마지막 단어 다음 칸 시각에(N4). 앱을 열면 그 전에 다시 예약돼 밀려난다.
  const last = slots.length > 0 ? slots[slots.length - 1].fireAt : now;
  const noticeAt = times.find(t => t > last);
  if (noticeAt !== undefined) {
    slots.push({ fireAt: noticeAt, wordId: null, roundStart: false });
    notifications.push({ fireAt: noticeAt, word: null, listId: null });
  }

  return {
    notifications,
    nextState: { sent: keptSent, slots, stopNoticeSent: false },
  };
}
