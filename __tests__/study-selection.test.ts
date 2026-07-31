/**
 * 학습 세션에 넘기는 단어 목록(features/study/store.ts).
 *
 * 라우터 파라미터로 id를 이어 붙이던 것을 스토어 전달로 바꾸면서, 화면이
 * "내가 받은 목록"과 "지금 스토어에 있는 목록"을 구분해야 한다. 토큰이 그 역할이다.
 */
import {
  useStudySelectionStore,
  setStudySelection,
  selectStudySelection,
  applyStudySelection,
} from '@/features/study/store';

beforeEach(() => {
  useStudySelectionStore.getState().clear();
});

describe('setStudySelection', () => {
  it('목록을 저장하고 조회용 토큰을 돌려준다', () => {
    const token = setStudySelection(['a', 'b', 'c']);

    expect(token).toBeTruthy();
    expect(selectStudySelection(useStudySelectionStore.getState(), token)).toEqual(['a', 'b', 'c']);
  });

  it('호출할 때마다 다른 토큰을 준다', () => {
    const first = setStudySelection(['a']);
    const second = setStudySelection(['b']);

    expect(first).not.toBe(second);
  });
});

describe('selectStudySelection', () => {
  it('토큰이 없으면 null — 목록 없이 연 화면은 자기 필터를 쓴다', () => {
    setStudySelection(['a', 'b']);

    expect(selectStudySelection(useStudySelectionStore.getState(), undefined)).toBeNull();
  });

  it('토큰이 어긋나면 null — 다른 세션이 덮어쓴 목록을 쓰지 않는다', () => {
    const stale = setStudySelection(['a', 'b']);
    setStudySelection(['c', 'd']); // 다른 세션이 스토어를 덮어쓴 상황

    expect(selectStudySelection(useStudySelectionStore.getState(), stale)).toBeNull();
  });

  it('clear 뒤에는 이전 토큰으로도 조회되지 않는다', () => {
    const token = setStudySelection(['a']);
    useStudySelectionStore.getState().clear();

    expect(selectStudySelection(useStudySelectionStore.getState(), token)).toBeNull();
  });
});

describe('applyStudySelection', () => {
  const words = [
    { id: 'w1', term: 'alpha' },
    { id: 'w2', term: 'bravo' },
    { id: 'w3', term: 'charlie' },
    { id: 'w4', term: 'delta' },
  ];

  it('선택한 것만 남긴다', () => {
    const result = applyStudySelection(words, ['w3', 'w1']);

    expect(result.map(w => w.id)).toEqual(['w3', 'w1']);
  });

  it('선택한 순서대로 정렬한다 — 맞춤학습이 섞어 넘긴 순서가 학습에서 유지되어야 한다', () => {
    const result = applyStudySelection(words, ['w4', 'w2', 'w3', 'w1']);

    expect(result.map(w => w.id)).toEqual(['w4', 'w2', 'w3', 'w1']);
  });

  it('이미 지워진 단어 id가 섞여 있어도 나머지를 그대로 낸다', () => {
    const result = applyStudySelection(words, ['w2', 'gone', 'w1']);

    expect(result.map(w => w.id)).toEqual(['w2', 'w1']);
  });

  it('선택이 비면 빈 배열', () => {
    expect(applyStudySelection(words, [])).toEqual([]);
  });

  it('원본 배열을 건드리지 않는다', () => {
    const original = [...words];
    applyStudySelection(words, ['w4', 'w1']);

    expect(words).toEqual(original);
  });
});
