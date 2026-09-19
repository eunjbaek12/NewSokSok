/**
 * 위젯 하나가 기억하는 것 — 지금 띄운 단어, 뜻을 열었는지, 오늘 몇 개 했는지, 어느 단어장인지.
 *
 * 🔑 **위젯마다 따로 둔다.** 같은 위젯을 여러 개 놓고 «나올 단어»를 따로 정하는 것이 W7 의
 * 전제라(토익 위젯 · 회화 위젯), 진도도 위젯마다 세야 «오늘 끝!»이 각각 맞는다.
 *
 * 저장은 AsyncStorage — 설정(`@soksok_*`)이 이미 쓰는 곳이고, 헤드리스에서도 열린다.
 * 🔴 읽기·쓰기가 실패해도 위젯은 그려져야 한다. 상태를 못 읽으면 «처음 상태»로 보고 이어간다 —
 * 빈 얼굴로 남는 것이 사용자에게 훨씬 나쁘다.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WidgetMode } from './next-word';

const KEY_PREFIX = '@soksok_widget_';

export interface WidgetState {
  /** 지금 띄워 둔 단어. 판정 탭이 «다음 단어»를 건드리지 않게 하는 기준이기도 하다. */
  wordId: string | null;
  listId: string | null;
  mode: WidgetMode | null;
  /** 뜻을 열었나(W5). 판정하면 다시 닫힌다. */
  revealed: boolean;
  /** 오늘 몇 개 했나. 날짜가 바뀌면 0 부터 — 달력일 기준이라 자정에 저절로 풀린다. */
  date: string;
  doneReview: number;
  doneNew: number;
  /** 고른 단어장. null 이면 «자동»(마지막으로 공부한 단어장). */
  pinnedListId: string | null;
}

export const EMPTY_STATE: WidgetState = {
  wordId: null,
  listId: null,
  mode: null,
  revealed: false,
  date: '',
  doneReview: 0,
  doneNew: 0,
  pinnedListId: null,
};

/** 달력일 문자열. 시간대는 폰을 따른다 — 복습 알림이 쓰는 기준과 같다. */
export function dayKey(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** 날짜가 바뀌었으면 오늘 몫을 0 으로 돌린다. */
export function rollOver(state: WidgetState, now: number): WidgetState {
  const today = dayKey(now);
  if (state.date === today) return state;
  return { ...state, date: today, doneReview: 0, doneNew: 0 };
}

export async function loadWidgetState(widgetId: number, now: number): Promise<WidgetState> {
  try {
    const raw = await AsyncStorage.getItem(KEY_PREFIX + widgetId);
    if (!raw) return rollOver({ ...EMPTY_STATE }, now);
    const parsed = JSON.parse(raw) as Partial<WidgetState>;
    return rollOver({ ...EMPTY_STATE, ...parsed }, now);
  } catch {
    return rollOver({ ...EMPTY_STATE }, now);
  }
}

export async function saveWidgetState(widgetId: number, state: WidgetState): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_PREFIX + widgetId, JSON.stringify(state));
  } catch {
    // 못 써도 화면은 이미 그려진다. 다음 탭에서 한 칸 되돌아갈 뿐이다.
  }
}

/** 위젯을 떼면 그 위젯의 기억도 지운다 — 다시 놓으면 새 위젯 id 를 받는다. */
export async function clearWidgetState(widgetId: number): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY_PREFIX + widgetId);
  } catch {
    // 남아도 새 id 라 읽히지 않는다.
  }
}
