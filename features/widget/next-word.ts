/**
 * 위젯에 무엇을 띄울지 고른다 — 순수 함수(RN/expo import 없음, jest 로 검증 가능).
 *
 * 규칙은 `docs/widget-design.md` §-2 «다음 단어 고르기»가 정본이다:
 *
 *   ① 복습할 단어 — 앱 «복습하기»와 똑같이(숨긴 단어장 뺀 전체 · 하루 20)
 *   ② 없으면 새 단어 — 단어장 순서대로, 안 외운 단어부터 · 하루 10
 *   ③ 단어장이 비었으면 앱 열기
 *   ④ ①②를 다 하면 «오늘 끝!»
 *
 * 🔑 **Day 로 자르지 않는다.** 계획은 단어장 순서대로 Day 를 나누고 외운 단어는 조건에서
 * 빠지므로, 순서만 지키면 계획이 있는 사람도 **저절로 지금 공부하는 자리부터** 나온다.
 * 그래서 화면에 «Day 5» 같은 설명을 달 필요도 없어진다(9/17 결정).
 */
import type { VocaList, Word } from '@/lib/types';

/** 새 단어 하루 상한. 조건을 무엇으로 고르든 같다 — 상한을 둔 이유가 «끝이 있어야 한다»뿐이라(9/19 확정). */
export const WIDGET_NEW_DAILY_CAP = 10;

/** 복습 하루 상한. 앱 «복습하기»의 값 그대로 — 다른 수를 쓰면 앱과 위젯의 복습이 갈라진다. */
export const WIDGET_REVIEW_DAILY_CAP = 20;

export type WidgetMode = 'review' | 'new';

export interface WidgetPick {
  kind: 'word';
  word: Word;
  listId: string;
  listTitle: string;
  mode: WidgetMode;
  /** 오늘 이 모드로 끝낸 개수와 상한 — 위젯 오른쪽 아래 «4 / 10». */
  done: number;
  cap: number;
}

export interface WidgetEmpty {
  kind: 'empty';
  /**
   * no-lists  = 단어장이 하나도 없다(또는 전부 숨김)
   * empty-list = 출처 단어장에 단어가 없다
   * done-today = 오늘 할 몫을 다 했다
   */
  reason: 'no-lists' | 'empty-list' | 'done-today';
  listTitle?: string;
}

export type WidgetContent = WidgetPick | WidgetEmpty;

export interface DoneToday {
  review: number;
  new: number;
}

/** 그 단어를 오늘 이미 봤나. 같은 단어가 곧바로 다시 뜨는 것을 막는 유일한 기준이다. */
function seenToday(word: Word, now: number): boolean {
  const at = word.lastReviewedAt;
  if (at == null) return false;
  const a = new Date(at);
  const b = new Date(now);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * 학습 순서대로 세운다.
 *
 * 계획이 있으면 `assignedDay` 가 곧 그 순서다(계획을 세울 때 단어장 순서대로 나눠 저장해
 * 둔다). 없으면 배열 순서 — 그것이 앱이 화면에서 쓰는 순서이기도 하다.
 * 🔴 배열을 제자리에서 정렬하면 호출부의 `list.words` 가 뒤바뀐다. 반드시 복사본을 세운다.
 */
function inStudyOrder(words: Word[]): Word[] {
  return words
    .map((word, index) => ({ word, index }))
    .sort((a, b) => {
      const da = a.word.assignedDay ?? Number.MAX_SAFE_INTEGER;
      const db = b.word.assignedDay ?? Number.MAX_SAFE_INTEGER;
      if (da !== db) return da - db;
      return a.index - b.index;
    })
    .map(x => x.word);
}

/**
 * 출처 단어장 — W3. «마지막으로 공부한 단어장», 학습 이력이 없으면 **단어장 목록 맨 위**.
 *
 * 맨 위로 떨어뜨리는 쪽이 중요하다: 8/19 실측에서 단어 20개 이상인 44명 중 22명이 학습 0이었다.
 * «앱에서 한 번 학습하세요» 안내를 띄우면 그 절반에게 위젯은 영구히 빈 얼굴이 된다.
 */
export function resolveSourceList(lists: VocaList[], pinnedListId: string | null): VocaList | null {
  const visible = lists.filter(l => l.isVisible);
  if (visible.length === 0) return null;

  if (pinnedListId) {
    const pinned = visible.find(l => l.id === pinnedListId);
    if (pinned) return pinned;
    // 고른 단어장을 숨기거나 지웠다면 «자동»으로 되돌아간다(§-2 «나올 단어»).
  }

  const studied = visible
    .filter(l => (l.lastStudiedAt ?? 0) > 0)
    .sort((a, b) => (b.lastStudiedAt ?? 0) - (a.lastStudiedAt ?? 0));
  return studied[0] ?? visible[0];
}

export function pickWidgetContent(params: {
  lists: VocaList[];
  now: number;
  doneToday: DoneToday;
  /** 고른 단어장. null 이면 «자동». */
  pinnedListId: string | null;
  /** 복습 후보(앱 «복습하기»가 고른 것). 호출부가 `selectReviewWords` 로 만들어 넘긴다. */
  reviewCandidates: Word[];
}): WidgetContent {
  const { lists, now, doneToday, pinnedListId, reviewCandidates } = params;

  const source = resolveSourceList(lists, pinnedListId);
  if (!source) return { kind: 'empty', reason: 'no-lists' };

  // ① 복습 먼저. 고른 단어장이 있으면 그 단어장의 복습만 나온다(§-2 «나올 단어»).
  const reviewLeft = WIDGET_REVIEW_DAILY_CAP - doneToday.review;
  if (reviewLeft > 0) {
    const scoped = pinnedListId
      ? reviewCandidates.filter(w => source.words.some(x => x.id === w.id))
      : reviewCandidates;
    const review = scoped.find(w => !seenToday(w, now)) ?? scoped[0];
    if (review) {
      const owner = lists.find(l => l.words.some(w => w.id === review.id)) ?? source;
      return {
        kind: 'word',
        word: review,
        listId: owner.id,
        listTitle: owner.title,
        mode: 'review',
        done: doneToday.review,
        cap: WIDGET_REVIEW_DAILY_CAP,
      };
    }
  }

  // ② 새 단어 — 출처 단어장에서 순서대로, 안 외운 것부터.
  if (source.words.length === 0) {
    return { kind: 'empty', reason: 'empty-list', listTitle: source.title };
  }
  if (doneToday.new >= WIDGET_NEW_DAILY_CAP) {
    return { kind: 'empty', reason: 'done-today', listTitle: source.title };
  }

  const ordered = inStudyOrder(source.words).filter(w => !w.isMemorized);
  // «다시 볼게요»를 누른 단어는 암기 상태가 그대로라 여전히 맨 앞이다 → 오늘 본 것은 맨 뒤로.
  // 저장할 것이 따로 없다(lastReviewedAt 은 판정이 이미 남긴다).
  const fresh = ordered.filter(w => !seenToday(w, now));
  const next = fresh[0] ?? ordered[0];

  if (!next) {
    // 다 외웠다 — «단어장이 비었어요»가 아니라 «오늘 끝!»이다(빈 단어장과 혼동하면 오해를 부른다).
    return { kind: 'empty', reason: 'done-today', listTitle: source.title };
  }

  return {
    kind: 'word',
    word: next,
    listId: source.id,
    listTitle: source.title,
    mode: 'new',
    done: doneToday.new,
    cap: WIDGET_NEW_DAILY_CAP,
  };
}
