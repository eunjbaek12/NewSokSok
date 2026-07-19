import { partitionSessionResults } from '@/features/study/session-results';
import type { StudyResult, Word } from '@/lib/types';

const DAY = 86400000;
const NOW = new Date(2026, 6, 20, 12).getTime(); // 2026-07-20 정오
const daysAgo = (n: number) => NOW - n * DAY;

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

/** 이미 외운 단어. 기본은 사다리 1칸(3일 간격). */
const memorized = (id: string, over: Partial<Word> = {}): Word =>
  word(id, { isMemorized: true, reviewSuccessCount: 1, lastReviewedAt: daysAgo(1), ...over });

const r = (w: Word, gotIt: boolean): StudyResult => ({ word: w, gotIt });

describe('partitionSessionResults', () => {
  it('빈 결과 → 전부 빈 배열', () => {
    const plan = partitionSessionResults([], NOW);
    expect(plan).toEqual({
      memorizedIds: [], failedIds: [], wrongIds: [], correctIds: [],
      reviewAdvanceIds: [], seenIds: [],
    });
  });

  it('gotIt + 미암기 → memorizedIds (암기 전환)', () => {
    const plan = partitionSessionResults([r(word('a'), true)], NOW);
    expect(plan.memorizedIds).toEqual(['a']);
    expect(plan.failedIds).toEqual([]);
    expect(plan.wrongIds).toEqual([]);
  });

  it('오답 + 암기 상태 → failedIds(강등) + wrongIds', () => {
    const plan = partitionSessionResults([r(memorized('a'), false)], NOW);
    expect(plan.failedIds).toEqual(['a']);
    expect(plan.wrongIds).toEqual(['a']);
  });

  it('오답 + 미암기 → wrongIds만', () => {
    const plan = partitionSessionResults([r(word('a'), false)], NOW);
    expect(plan.failedIds).toEqual([]);
    expect(plan.wrongIds).toEqual(['a']);
  });

  it('gotIt + 오답 이력(wrongCount>0) → correctIds(리셋)', () => {
    const plan = partitionSessionResults([r(word('a', { wrongCount: 2 }), true)], NOW);
    expect(plan.correctIds).toEqual(['a']);
  });

  it('희소 배열(퀴즈 인덱스 대입)의 빈 칸은 무시', () => {
    const sparse: (StudyResult | undefined)[] = [];
    sparse[0] = r(word('a'), true);
    sparse[5] = r(memorized('b'), false);
    const plan = partitionSessionResults(sparse, NOW);
    expect(plan.memorizedIds).toEqual(['a']);
    expect(plan.failedIds).toEqual(['b']);
    expect(plan.wrongIds).toEqual(['b']);
    expect(plan.seenIds).toEqual(['a', 'b']);
  });

  // ─── 복습(gentle SRS) 분류 ────────────────────────────────────────────────

  describe('seenIds — "볼 때마다" 마지막 학습 시각 갱신', () => {
    it('정답·오답 무관하게 답한 전부', () => {
      const plan = partitionSessionResults([
        r(word('got'), true),
        r(word('miss'), false),
      ], NOW);
      expect(plan.seenIds).toEqual(['got', 'miss']);
    });
  });

  describe('reviewAdvanceIds — due였던 단어를 맞힌 경우만 사다리 전진', () => {
    it('due였고 맞힘 → 전진', () => {
      // 3일 간격인데 3일 지남 = due.
      const plan = partitionSessionResults([r(memorized('a', { lastReviewedAt: daysAgo(3) }), true)], NOW);
      expect(plan.reviewAdvanceIds).toEqual(['a']);
    });

    it('아직 due가 아닌데 맞힘 → 전진 없음(연속 학습으로 사다리가 부풀지 않는다)', () => {
      const plan = partitionSessionResults([r(memorized('a', { lastReviewedAt: daysAgo(1) }), true)], NOW);
      expect(plan.reviewAdvanceIds).toEqual([]);
      // 다만 본 시각은 갱신된다.
      expect(plan.seenIds).toEqual(['a']);
    });

    it('처음 외운 단어는 전진이 아니라 시작(memorizedIds) — 카운트를 1로 대입한다', () => {
      const plan = partitionSessionResults([r(word('a'), true)], NOW);
      expect(plan.memorizedIds).toEqual(['a']);
      expect(plan.reviewAdvanceIds).toEqual([]);
    });

    it('due였지만 틀림 → 전진 없음(리셋 대상)', () => {
      const plan = partitionSessionResults([r(memorized('a', { lastReviewedAt: daysAgo(30) }), false)], NOW);
      expect(plan.reviewAdvanceIds).toEqual([]);
      expect(plan.wrongIds).toEqual(['a']);
    });

    it('은퇴한 단어는 맞혀도 전진하지 않는다 — 사다리 끝을 넘지 않게', () => {
      const plan = partitionSessionResults(
        [r(memorized('a', { reviewSuccessCount: 7, lastReviewedAt: daysAgo(9999) }), true)],
        NOW,
      );
      expect(plan.reviewAdvanceIds).toEqual([]);
    });

    it('나흘 연속 학습해도 사다리는 한 번도 전진하지 않는다', () => {
      // 매일 공부 = 매일 lastReviewedAt이 어제로 갱신된 상태 → 3일이 찰 틈이 없다.
      for (const day of [1, 1, 1, 1]) {
        const plan = partitionSessionResults([r(memorized('a', { lastReviewedAt: daysAgo(day) }), true)], NOW);
        expect(plan.reviewAdvanceIds).toEqual([]);
      }
    });
  });

  it('혼합 세션 — finishSession과 동일한 분류', () => {
    const plan = partitionSessionResults([
      r(word('new-got'), true),                                        // 암기 전환(사다리 시작)
      r(memorized('due-got', { lastReviewedAt: daysAgo(5) }), true),   // due 복습 성공 → 전진
      r(memorized('early-got', { lastReviewedAt: daysAgo(1) }), true), // 미리 봄 → 전진 없음
      r(memorized('memo-miss'), false),                                // 강등+오답
      r(word('new-miss'), false),                                      // 오답만
      r(word('redeemed', { wrongCount: 1 }), true),                    // 전환+오답리셋
    ], NOW);
    expect(plan.memorizedIds).toEqual(['new-got', 'redeemed']);
    expect(plan.failedIds).toEqual(['memo-miss']);
    expect(plan.wrongIds).toEqual(['memo-miss', 'new-miss']);
    expect(plan.correctIds).toEqual(['redeemed']);
    expect(plan.reviewAdvanceIds).toEqual(['due-got']);
    expect(plan.seenIds).toEqual(['new-got', 'due-got', 'early-got', 'memo-miss', 'new-miss', 'redeemed']);
  });
});
