import { partitionSessionResults } from '@/features/study/session-results';
import type { StudyResult, Word } from '@/lib/types';

function word(id: string, over: Partial<Word> = {}): Word {
  return {
    id,
    term: id,
    definition: '',
    exampleEn: '',
    meaningKr: '',
    isMemorized: false,
    isStarred: false,
    tags: [],
    ...over,
  } as Word;
}

const r = (w: Word, gotIt: boolean): StudyResult => ({ word: w, gotIt });

describe('partitionSessionResults', () => {
  it('빈 결과 → 전부 빈 배열', () => {
    const plan = partitionSessionResults([]);
    expect(plan).toEqual({ memorizedIds: [], failedIds: [], wrongIds: [], correctIds: [] });
  });

  it('gotIt + 미암기 → memorizedIds (암기 전환)', () => {
    const plan = partitionSessionResults([r(word('a'), true)]);
    expect(plan.memorizedIds).toEqual(['a']);
    expect(plan.failedIds).toEqual([]);
    expect(plan.wrongIds).toEqual([]);
  });

  it('gotIt + 이미 암기 → 아무 전환 없음', () => {
    const plan = partitionSessionResults([r(word('a', { isMemorized: true }), true)]);
    expect(plan.memorizedIds).toEqual([]);
    expect(plan.failedIds).toEqual([]);
  });

  it('오답 + 암기 상태 → failedIds(강등) + wrongIds', () => {
    const plan = partitionSessionResults([r(word('a', { isMemorized: true }), false)]);
    expect(plan.failedIds).toEqual(['a']);
    expect(plan.wrongIds).toEqual(['a']);
  });

  it('오답 + 미암기 → wrongIds만', () => {
    const plan = partitionSessionResults([r(word('a'), false)]);
    expect(plan.failedIds).toEqual([]);
    expect(plan.wrongIds).toEqual(['a']);
  });

  it('gotIt + 오답 이력(wrongCount>0) → correctIds(리셋)', () => {
    const plan = partitionSessionResults([r(word('a', { wrongCount: 2 } as any), true)]);
    expect(plan.correctIds).toEqual(['a']);
  });

  it('희소 배열(퀴즈 인덱스 대입)의 빈 칸은 무시', () => {
    const sparse: (StudyResult | undefined)[] = [];
    sparse[0] = r(word('a'), true);
    sparse[5] = r(word('b', { isMemorized: true }), false);
    const plan = partitionSessionResults(sparse);
    expect(plan.memorizedIds).toEqual(['a']);
    expect(plan.failedIds).toEqual(['b']);
    expect(plan.wrongIds).toEqual(['b']);
  });

  it('혼합 세션 — finishSession과 동일한 분류', () => {
    const plan = partitionSessionResults([
      r(word('new-got'), true),                                          // 암기 전환
      r(word('old-got', { isMemorized: true }), true),                   // 유지
      r(word('memo-miss', { isMemorized: true }), false),                // 강등+오답
      r(word('new-miss'), false),                                        // 오답만
      r(word('redeemed', { wrongCount: 1 } as any), true),               // 전환+리셋
    ]);
    expect(plan.memorizedIds).toEqual(['new-got', 'redeemed']);
    expect(plan.failedIds).toEqual(['memo-miss']);
    expect(plan.wrongIds).toEqual(['memo-miss', 'new-miss']);
    expect(plan.correctIds).toEqual(['redeemed']);
  });
});
