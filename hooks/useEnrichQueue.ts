import { useCallback, useRef, useState } from 'react';
import { enrichWord } from '@/lib/translation-api';
import { runEnrichBatchWithRecovery, type EnrichQueueItem } from '@/lib/enrich-queue-core';
import type { AutoFillResult } from '@/lib/types';
import type { EnrichMode } from '@/lib/ai/edge-enrich';

const DEFAULT_CONCURRENCY = 4;

export type EnrichItem = EnrichQueueItem;

export type EnrichUpdateCallback = (id: string, result: AutoFillResult | null) => void;

interface UseEnrichQueueResult {
  enrichBatch: (items: EnrichItem[], onUpdate: EnrichUpdateCallback, signal: AbortSignal) => Promise<void>;
  enrichingCount: number;
}

// (sourceLang, targetLang, apiKey) 컨텍스트로 N개 단어를 Gemini 보강하는
// 공용 hook. 사진 임포트·일괄 임포트가 공유.
//
// mode는 quota 차감 가중치에 영향: 'photo'=1(+스캔 오버헤드는 scan-image가 별도),
// 'generate'=단어당 1, 'autocomplete'=1. 사진 흐름은 'photo' 명시 필수.
//
// 큐 알고리즘(429 대기 후 재시도 + 실패분 2차 패스)은 lib/enrich-queue-core.ts.
// batch:true로 enrichWord의 배치 타임아웃(30초)·RateLimitedError 신호를 켠다.
//
// 호출자는 본인 state(예: scannedWords)를 갖고, onUpdate 콜백으로 결과를 받아
// setState 함. onUpdate는 아이템당 1회(성공) 또는 2회(1차 실패 null → 2차 결과)
// 불릴 수 있다 — 나중 호출이 이긴다.
export function useEnrichQueue(
  sourceLang: string,
  targetLang: string,
  apiKey: string | undefined,
  concurrency: number = DEFAULT_CONCURRENCY,
  mode: EnrichMode = 'autocomplete',
): UseEnrichQueueResult {
  const enrichingCountRef = useRef(0);
  const [enrichingCount, setEnrichingCount] = useState(0);

  const enrichBatch = useCallback(async (
    items: EnrichItem[],
    onUpdate: EnrichUpdateCallback,
    signal: AbortSignal,
  ) => {
    if (items.length === 0) return;
    enrichingCountRef.current += items.length;
    setEnrichingCount(enrichingCountRef.current);

    // final 통지(성공 또는 2차 패스까지 끝난 실패)에서만 카운터를 내린다 —
    // 1차 실패는 2차 재시도가 남아 있어 저장 버튼 잠금을 유지해야 한다.
    let settled = 0;
    const settle = () => {
      settled += 1;
      enrichingCountRef.current = Math.max(0, enrichingCountRef.current - 1);
      setEnrichingCount(enrichingCountRef.current);
    };

    try {
      await runEnrichBatchWithRecovery<AutoFillResult>(
        items,
        (item, sig) => enrichWord(item.term, sourceLang, targetLang, apiKey, sig, mode, undefined, { batch: true }),
        (id, result, final) => {
          onUpdate(id, result);
          if (final) settle();
        },
        concurrency,
        signal,
      );
    } finally {
      // 중단(abort) 시 처리되지 못한 잔여 아이템만큼 카운터 보정 — 안 하면
      // 재촬영 후 새 배치에서 카운터가 0으로 못 내려가 저장 버튼이 "보강 중"에 갇힌다.
      const leftover = items.length - settled;
      if (leftover > 0) {
        enrichingCountRef.current = Math.max(0, enrichingCountRef.current - leftover);
        setEnrichingCount(enrichingCountRef.current);
      }
    }
  }, [sourceLang, targetLang, apiKey, mode, concurrency]);

  return { enrichBatch, enrichingCount };
}
