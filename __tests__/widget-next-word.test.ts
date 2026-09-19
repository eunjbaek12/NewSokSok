/**
 * 위젯이 «무엇을 띄울지» 고르는 규칙 — 순수 로직이라 여기서 다 잡는다.
 *
 * 실기로는 확인하기 어려운 것들이다: 오늘 본 단어가 뒤로 가는지는 하루를 기다려야 보이고,
 * 하루 상한은 열 번을 눌러야 닿는다. 그래서 규칙 쪽은 테스트가 맡고, 실기는 «화면이
 * 제대로 그려지는가»에 집중한다.
 */
import {
  pickWidgetContent,
  resolveSourceList,
  WIDGET_NEW_DAILY_CAP,
  WIDGET_REVIEW_DAILY_CAP,
} from '../features/widget/next-word';
import type { VocaList, Word } from '../lib/types';

const NOW = new Date(2026, 8, 19, 15, 0, 0).getTime();
const YESTERDAY = NOW - 24 * 60 * 60 * 1000;

function word(id: string, over: Partial<Word> = {}): Word {
  return {
    id,
    term: id,
    definition: `${id} def`,
    exampleEn: '',
    meaningKr: `${id} 뜻`,
    isMemorized: false,
    isStarred: false,
    tags: [],
    ...over,
  };
}

function list(id: string, words: Word[], over: Partial<VocaList> = {}): VocaList {
  return {
    id,
    title: id,
    words,
    isVisible: true,
    createdAt: 0,
    ...over,
  };
}

const noReview: Word[] = [];

describe('출처 단어장', () => {
  it('마지막으로 공부한 단어장을 고른다', () => {
    const a = list('a', [word('a1')], { lastStudiedAt: 100 });
    const b = list('b', [word('b1')], { lastStudiedAt: 900 });
    expect(resolveSourceList([a, b], null)?.id).toBe('b');
  });

  it('학습 이력이 없으면 목록 맨 위 — 실측상 학습 0 인 사용자가 절반이라 빈 얼굴로 두지 않는다', () => {
    const a = list('a', [word('a1')]);
    const b = list('b', [word('b1')]);
    expect(resolveSourceList([a, b], null)?.id).toBe('a');
  });

  it('숨긴 단어장은 후보가 아니다', () => {
    const hidden = list('a', [word('a1')], { isVisible: false, lastStudiedAt: 900 });
    const shown = list('b', [word('b1')]);
    expect(resolveSourceList([hidden, shown], null)?.id).toBe('b');
  });

  it('고른 단어장을 숨기거나 지우면 자동으로 되돌아간다', () => {
    const gone = list('a', [word('a1')], { isVisible: false });
    const shown = list('b', [word('b1')]);
    expect(resolveSourceList([gone, shown], 'a')?.id).toBe('b');
  });
});

describe('다음 단어', () => {
  const base = {
    now: NOW,
    doneToday: { review: 0, new: 0 },
    pinnedListId: null,
    reviewCandidates: noReview,
  };

  it('복습이 있으면 복습이 먼저다', () => {
    // 복습 대상은 «외운 뒤 다시 볼 때가 된 단어»다(isMemorized: true).
    const w = word('due', { isMemorized: true });
    const lists = [list('a', [w, word('new1')])];
    const out = pickWidgetContent({ ...base, lists, reviewCandidates: [w] });
    expect(out).toMatchObject({ kind: 'word', mode: 'review', word: { id: 'due' } });
  });

  it('복습이 없으면 안 외운 단어를 단어장 순서대로 준다', () => {
    const lists = [list('a', [word('w1', { isMemorized: true }), word('w2'), word('w3')])];
    const out = pickWidgetContent({ ...base, lists });
    expect(out).toMatchObject({ kind: 'word', mode: 'new', word: { id: 'w2' } });
  });

  it('계획이 있으면 Day 순서를 따른다 — 배열 순서보다 앞선다', () => {
    const lists = [
      list('a', [
        word('late', { assignedDay: 5 }),
        word('early', { assignedDay: 2 }),
      ]),
    ];
    const out = pickWidgetContent({ ...base, lists });
    expect(out).toMatchObject({ word: { id: 'early' } });
  });

  it('오늘 본 단어는 맨 뒤로 — «다시 볼게요»를 누른 단어가 곧바로 다시 뜨지 않는다', () => {
    const lists = [
      list('a', [word('seen', { lastReviewedAt: NOW }), word('fresh')]),
    ];
    const out = pickWidgetContent({ ...base, lists });
    expect(out).toMatchObject({ word: { id: 'fresh' } });
  });

  it('어제 본 단어는 그대로 앞에 있다', () => {
    const lists = [
      list('a', [word('seen', { lastReviewedAt: YESTERDAY }), word('fresh')]),
    ];
    const out = pickWidgetContent({ ...base, lists });
    expect(out).toMatchObject({ word: { id: 'seen' } });
  });

  it('오늘 본 것밖에 없으면 그중에서라도 준다 — 빈 얼굴보다 낫다', () => {
    const lists = [list('a', [word('seen', { lastReviewedAt: NOW })])];
    const out = pickWidgetContent({ ...base, lists });
    expect(out).toMatchObject({ word: { id: 'seen' } });
  });

  it('고른 단어장이 있으면 복습도 그 단어장에서만 나온다', () => {
    const mine = word('mine', { isMemorized: true });
    const other = word('other', { isMemorized: true });
    const lists = [list('a', [mine]), list('b', [other])];
    const out = pickWidgetContent({
      ...base,
      lists,
      pinnedListId: 'a',
      reviewCandidates: [other, mine],
    });
    expect(out).toMatchObject({ mode: 'review', word: { id: 'mine' } });
  });
});

describe('상한과 빈 화면', () => {
  const base = {
    now: NOW,
    pinnedListId: null,
    reviewCandidates: noReview,
  };

  it(`새 단어는 하루 ${WIDGET_NEW_DAILY_CAP} 개에서 «오늘 끝!»`, () => {
    const lists = [list('a', [word('w1'), word('w2')])];
    const out = pickWidgetContent({
      ...base,
      lists,
      doneToday: { review: 0, new: WIDGET_NEW_DAILY_CAP },
    });
    expect(out).toMatchObject({ kind: 'empty', reason: 'done-today' });
  });

  it(`복습 상한(${WIDGET_REVIEW_DAILY_CAP})을 채우면 새 단어로 넘어간다`, () => {
    const due = word('due', { isMemorized: true });
    const lists = [list('a', [due, word('new1')])];
    const out = pickWidgetContent({
      ...base,
      lists,
      doneToday: { review: WIDGET_REVIEW_DAILY_CAP, new: 0 },
      reviewCandidates: [due],
    });
    expect(out).toMatchObject({ mode: 'new', word: { id: 'new1' } });
  });

  it('다 외웠으면 «단어장이 비었어요»가 아니라 «오늘 끝!» — 둘을 섞으면 오해한다', () => {
    const lists = [list('a', [word('w1', { isMemorized: true })])];
    const out = pickWidgetContent({ ...base, lists, doneToday: { review: 0, new: 0 } });
    expect(out).toMatchObject({ kind: 'empty', reason: 'done-today' });
  });

  it('단어가 0 개면 «단어장이 비었어요»', () => {
    const lists = [list('a', [])];
    const out = pickWidgetContent({ ...base, lists, doneToday: { review: 0, new: 0 } });
    expect(out).toMatchObject({ kind: 'empty', reason: 'empty-list' });
  });

  it('단어장이 하나도 없으면 «단어장이 없어요»', () => {
    const out = pickWidgetContent({ ...base, lists: [], doneToday: { review: 0, new: 0 } });
    expect(out).toMatchObject({ kind: 'empty', reason: 'no-lists' });
  });
});

describe('호출부를 망가뜨리지 않는다', () => {
  it('넘겨받은 words 배열을 제자리에서 정렬하지 않는다', () => {
    const words = [word('late', { assignedDay: 5 }), word('early', { assignedDay: 2 })];
    const lists = [list('a', words)];
    pickWidgetContent({
      lists,
      now: NOW,
      doneToday: { review: 0, new: 0 },
      pinnedListId: null,
      reviewCandidates: noReview,
    });
    expect(words.map(w => w.id)).toEqual(['late', 'early']);
  });
});
