import { useEffect, useRef, type RefObject } from 'react';
import { recordStudySession } from '@/features/stats';
import type { StudyResult } from '@/lib/types';

/**
 * 중도 이탈 세션의 학습량 기록.
 *
 * 복습 카운트는 원래 결과 화면 도달(완주) 시에만 기록돼, 단어장 반절을 보다가
 * 나가면 그날 활동이 0으로 남았다 — 암기 전환까지 없었다면 학습일 마킹이 안 돼
 * 스트릭이 끊기는 실질 불이익. 이 훅은 화면 언마운트 시 "그때까지 답한 카드 수"를
 * 한 번 기록해 부분 세션도 통계에 반영한다(ⓘ 문구 "복습 = 이날 학습한 단어"와
 * 일치). 완주 시엔 기존대로 결과 화면이 기록하므로, finishSession 진입 직후
 * 반환된 ref를 true로 세워 이중 기록을 막는다 — 완주는 router.replace로 즉시
 * 언마운트되기 때문에 플래그는 필수다.
 *
 * 한계(수용): 앱 강제 종료는 JS cleanup이 돌지 않아 그 세션은 기록되지 않는다.
 * 오토플레이는 기존 결정대로 통계 제외라 이 훅을 쓰지 않는다.
 */
export function useAbandonRecord(results: RefObject<StudyResult[]>): RefObject<boolean> {
  const completedRef = useRef(false);
  useEffect(() => {
    return () => {
      // exhaustive-deps의 "cleanup에서 ref.current 금지"는 DOM 노드 ref용 오탐 —
      // 여기서는 언마운트 시점의 최신 값을 읽는 것이 설계 그 자체다.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      if (completedRef.current) return;
      // 퀴즈는 인덱스 대입이라 배열이 희소할 수 있다 — 실제 답한 칸만 센다.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const seen = (results.current ?? []).filter(Boolean).length;
      if (seen > 0) recordStudySession(seen).catch(() => {});
    };
    // results는 호출부 useRef의 반환값 — 수명 내내 동일 참조라 재실행되지 않는다.
  }, [results]);
  return completedRef;
}
