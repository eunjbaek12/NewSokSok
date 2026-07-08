import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { getStatsSummary, type StatsSummary } from './db';

/**
 * 화면 포커스 시마다 최신 통계를 로드한다(학습 후 돌아오면 자동 갱신). 로딩 중이거나
 * 실패하면 null. 설정 스트립·통계 화면이 공유한다.
 */
export function useStatsSummary(): StatsSummary | null {
  const [summary, setSummary] = useState<StatsSummary | null>(null);
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      getStatsSummary()
        .then(r => { if (alive) setSummary(r); })
        .catch(() => {});
      return () => { alive = false; };
    }, [])
  );
  return summary;
}
