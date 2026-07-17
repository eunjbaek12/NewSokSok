import type { StudyResult } from '@/lib/types';
import { isWordDue } from './review/engine';

// 학습 세션 결과 → DB 커밋 대상 분류. 완주(finishSession)와 중도 이탈이 같은 규칙을
// 쓰도록 한 곳으로 모았다(이탈 시 암기 상태가 유실되던 버그의 재발 방지).
// 순수 함수 — RN/expo import 없음(jest 테스트 가능 조건).
export interface SessionCommitPlan {
  // 미암기 → 암기 전환 (gotIt인데 아직 미암기). 복습 사다리는 여기서 첫 칸(1)으로 시작한다.
  memorizedIds: string[];
  // 암기 → 미암기 강등 (틀렸는데 암기 상태)
  failedIds: string[];
  // 오답 카운트 +1. 복습 사다리 리셋(§4.5) 대상도 같은 집합 — "다시 볼게요" = !gotIt.
  wrongIds: string[];
  // 오답 카운트 리셋 (기존 오답 이력이 있는 단어를 맞힘)
  correctIds: string[];
  // 복습 사다리 한 칸 전진 — 이미 암기 상태였고 **due였던** 단어를 맞힌 경우만(§4.2).
  // 아래 reviewSuccessGate 주석 참조.
  reviewAdvanceIds: string[];
  // 답한 전부(정답·오답 무관) → lastReviewedAt = now. "볼 때마다 자동 갱신"(§4.1).
  seenIds: string[];
}

/**
 * 세션 결과를 커밋 대상으로 분류한다.
 *
 * `now`는 due 판정 기준 시각 — 세션을 시작할 때가 아니라 커밋할 때를 쓴다. 단어 스냅샷의
 * lastReviewedAt은 세션 중 바뀌지 않으므로 둘의 차이는 실질적으로 없다.
 *
 * ## 사다리 전진을 due로 게이트하는 이유 (reviewSuccessGate)
 *
 * "외웠어요"를 누를 때마다 칸을 올리면, 같은 단어장을 나흘 연속 공부한 성실한 사용자의
 * 단어가 전부 마지막 칸으로 밀려 복습이 몇 달간 사라진다. 사다리 값(3/10/30/90/180/365)은
 * **날짜 간격**이라 "10일 뒤에도 기억한다"는 주장인데, 하루 만에 다시 맞힌 것은 하루치
 * 기억력만 증명할 뿐 그 주장의 근거가 못 된다.
 *
 * 그래서 사다리는 "간격을 두고 되살린 횟수"만 센다. 매일 공부하는 단어장은 due가 될 틈이
 * 없어 칸이 멈추지만, 그동안 배너에도 안 뜨므로 사용자는 방해받지 않는다. 공부를 멈추면
 * 그때까지 쌓은 칸 기준으로 정상 재개된다.
 *
 * ⚠️ 게이트는 **진입 경로가 아니라 단어의 상태**를 본다. 복습 배너를 거치지 않고 단어장에서
 * 공부하다 마침 due였던 단어를 맞혀도 똑같이 전진한다.
 */
export function partitionSessionResults(
  results: readonly (StudyResult | undefined)[],
  now: number = Date.now(),
): SessionCommitPlan {
  // 퀴즈는 인덱스 대입이라 배열이 희소할 수 있다 — 실제 답한 칸만 취급.
  const answered = results.filter((r): r is StudyResult => !!r);
  return {
    memorizedIds: answered.filter(r => r.gotIt && !r.word.isMemorized).map(r => r.word.id),
    failedIds: answered.filter(r => !r.gotIt && r.word.isMemorized).map(r => r.word.id),
    wrongIds: answered.filter(r => !r.gotIt).map(r => r.word.id),
    correctIds: answered.filter(r => r.gotIt && (r.word.wrongCount ?? 0) > 0).map(r => r.word.id),
    reviewAdvanceIds: answered
      .filter(r => r.gotIt && r.word.isMemorized && isWordDue(r.word, now))
      .map(r => r.word.id),
    seenIds: answered.map(r => r.word.id),
  };
}
