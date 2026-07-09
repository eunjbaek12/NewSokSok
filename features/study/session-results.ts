import type { StudyResult } from '@/lib/types';

// 학습 세션 결과 → DB 커밋 대상 분류. 완주(finishSession)와 중도 이탈이 같은 규칙을
// 쓰도록 한 곳으로 모았다(이탈 시 암기 상태가 유실되던 버그의 재발 방지).
// 순수 함수 — RN/expo import 없음(jest 테스트 가능 조건).
export interface SessionCommitPlan {
  // 미암기 → 암기 전환 (gotIt인데 아직 미암기)
  memorizedIds: string[];
  // 암기 → 미암기 강등 (틀렸는데 암기 상태)
  failedIds: string[];
  // 오답 카운트 +1
  wrongIds: string[];
  // 오답 카운트 리셋 (기존 오답 이력이 있는 단어를 맞힘)
  correctIds: string[];
}

export function partitionSessionResults(results: readonly (StudyResult | undefined)[]): SessionCommitPlan {
  // 퀴즈는 인덱스 대입이라 배열이 희소할 수 있다 — 실제 답한 칸만 취급.
  const answered = results.filter((r): r is StudyResult => !!r);
  return {
    memorizedIds: answered.filter(r => r.gotIt && !r.word.isMemorized).map(r => r.word.id),
    failedIds: answered.filter(r => !r.gotIt && r.word.isMemorized).map(r => r.word.id),
    wrongIds: answered.filter(r => !r.gotIt).map(r => r.word.id),
    correctIds: answered.filter(r => r.gotIt && (r.word.wrongCount ?? 0) > 0).map(r => r.word.id),
  };
}
