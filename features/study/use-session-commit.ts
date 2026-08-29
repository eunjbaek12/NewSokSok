import { useCallback, useEffect, useRef, type RefObject } from 'react';
import {
  setWordsMemorized,
  incrementWrongCount,
  resetWrongCount,
  recordReviewOutcomes,
  updateStudyTime,
} from '@/features/vocab';
import { partitionSessionResults } from './session-results';
import type { StudyResult } from '@/lib/types';

/**
 * 세션 결과(암기 전환·오답 카운트)의 단일 커밋 지점.
 *
 * 종전에는 완주(finishSession)만 setWordsMemorized를 호출하고, 중도 이탈
 * (handleClose)은 오답 카운트만 보정해 — 분류하다 뒤로 가면 암기/미암기가
 * 통째로 유실됐다. 또 Android 하드웨어 뒤로가기는 handleClose조차 거치지
 * 않아(기본 pop) 오답 카운트마저 빠졌다.
 *
 * 커밋 경로 3개를 이렇게 정리한다:
 *  - 완주: finishSession이 commitSessionResults를 직접 await (기존과 동일 시점).
 *    진입 직후 completedRef=true라 아래 두 경로는 자동 무시.
 *  - 헤더 뒤로가기: handleClose가 반환된 commit()을 await 후 router.back() —
 *    목록 화면이 뜨기 전에 쓰기가 끝나 배지가 바로 맞는다.
 *  - Android 하드웨어 백 등 그 외 pop: 언마운트 cleanup이 commit()을
 *    fire-and-forget으로 실행(useAbandonRecord와 같은 패턴).
 * commit()은 1회만 실행되는 idempotent 가드를 갖는다(하드웨어 백 직후
 * cleanup과의 이중 커밋 방지).
 *
 * 한계(수용): 앱 강제 종료는 JS cleanup이 돌지 않아 그 세션은 유실된다.
 */
export function useSessionCommit(
  listId: string | undefined,
  results: RefObject<StudyResult[]>,
  completedRef: RefObject<boolean>,
): () => Promise<void> {
  const committedRef = useRef(false);
  const listIdRef = useRef(listId);
  listIdRef.current = listId;

  const commit = useCallback(async () => {
    if (committedRef.current) return;
    committedRef.current = true;
    const listIdNow = listIdRef.current;
    if (!listIdNow) return;
    await commitSessionResults(listIdNow, results.current ?? []);
  }, [results]);

  const commitRef = useRef(commit);
  commitRef.current = commit;

  useEffect(() => {
    return () => {
      // 언마운트 시점의 최신 값을 읽는 것이 설계 그 자체(use-abandon-record 참조).
      // eslint-disable-next-line react-hooks/exhaustive-deps
      if (completedRef.current) return;
      commitRef.current().catch(() => {});
    };
    // 전부 ref — 수명 내내 동일 참조라 재실행되지 않는다.
  }, [completedRef]);

  return commit;
}

// 완주·이탈 공용 커밋. 암기 전환은 setWordsMemorized 내부에서 memorized_log
// 통계 기록(recordMemorizedWords)까지 이어진다.
//
// 복습 상태(gentle SRS)도 여기서 함께 남긴다 — 학습 결과가 DB에 닿는 유일한
// 지점이라, 이탈 경로 3개(완주·헤더 백·하드웨어 백)가 자동으로 같은 규칙을 받는다.
// 암기 상태와 복습 상태는 서로 다른 컬럼을 건드리므로 호출 순서에 의존하지 않는다.
export async function commitSessionResults(
  listId: string,
  results: readonly (StudyResult | undefined)[],
): Promise<void> {
  const plan = partitionSessionResults(results);
  if (plan.memorizedIds.length > 0) await setWordsMemorized(listId, plan.memorizedIds, true);
  if (plan.failedIds.length > 0) await setWordsMemorized(listId, plan.failedIds, false);
  if (plan.wrongIds.length > 0) await incrementWrongCount(plan.wrongIds);
  if (plan.correctIds.length > 0) await resetWrongCount(plan.correctIds);
  await recordReviewOutcomes({
    seenIds: plan.seenIds,
    startIds: plan.memorizedIds,
    advanceIds: plan.reviewAdvanceIds,
    resetIds: plan.wrongIds,
  });
  // "마지막 학습" 시각 — 갱신 지점은 여기 하나뿐이다(features/vocab/db.ts의
  // updateStudyTime 주석 참조). 단어를 만지는 동작(편집·별표·복사·목록의 암기
  // 체크)은 학습이 아니므로 그쪽에서는 갱신하지 않는다.
  //
  // 🔑 카드를 한 장도 보지 않은 세션은 남기지 않는다 — 학습 화면에 들어갔다가
  //    바로 나오면 results 가 비어 있고, 그것까지 "학습함"으로 치면 예전처럼
  //    학습과 무관한 갱신이 다시 생긴다.
  if (plan.seenIds.length > 0) await updateStudyTime(listId);
}
