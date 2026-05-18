import { useCallback, useRef, useState } from 'react';
import { enrichWord } from '@/lib/translation-api';
import type { AutoFillResult } from '@/lib/types';
import type { EnrichMode } from '@/lib/ai/edge-enrich';

const DEFAULT_CONCURRENCY = 4;

export interface EnrichItem {
  id: string;
  term: string;
}

export type EnrichUpdateCallback = (id: string, result: AutoFillResult | null) => void;

interface UseEnrichQueueResult {
  enrichBatch: (items: EnrichItem[], onUpdate: EnrichUpdateCallback, signal: AbortSignal) => Promise<void>;
  enrichingCount: number;
}

// (sourceLang, targetLang, apiKey) 컨텍스트로 N개 단어를 Gemini 보강하는
// 공용 hook. 사진 임포트·일괄 임포트가 공유.
//
// mode는 quota 차감 가중치에 영향: 'photo'=15, 'generate'=20, 'autocomplete'=1.
// 사진 흐름은 'photo' 명시 필수.
//
// 호출자는 본인 state(예: scannedWords)를 갖고, onUpdate 콜백으로 결과를 받아
// setState 함. hook은 worker queue·abort·카운터만 관리.
export function useEnrichQueue(
  sourceLang: string,
  targetLang: string,
  apiKey: string | undefined,
  concurrency: number = DEFAULT_CONCURRENCY,
  mode: EnrichMode = 'autocomplete',
): UseEnrichQueueResult {
  const enrichingCountRef = useRef(0);
  const [enrichingCount, setEnrichingCount] = useState(0);

  const enrichOne = useCallback(async (
    item: EnrichItem,
    onUpdate: EnrichUpdateCallback,
    signal: AbortSignal,
  ) => {
    try {
      const result = await enrichWord(item.term, sourceLang, targetLang, apiKey, signal, mode);
      onUpdate(item.id, result);
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      onUpdate(item.id, null);
    } finally {
      enrichingCountRef.current = Math.max(0, enrichingCountRef.current - 1);
      setEnrichingCount(enrichingCountRef.current);
    }
  }, [sourceLang, targetLang, apiKey, mode]);

  const enrichBatch = useCallback(async (
    items: EnrichItem[],
    onUpdate: EnrichUpdateCallback,
    signal: AbortSignal,
  ) => {
    if (items.length === 0) return;
    enrichingCountRef.current += items.length;
    setEnrichingCount(enrichingCountRef.current);

    let cursor = 0;
    const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (cursor < items.length) {
        if (signal.aborted) return;
        const idx = cursor++;
        await enrichOne(items[idx], onUpdate, signal);
      }
    });
    await Promise.all(workers);
  }, [enrichOne, concurrency]);

  return { enrichBatch, enrichingCount };
}

// worker queue 알고리즘만 분리 — 단위 테스트용.
// hook을 mount하지 않고 동작을 검증할 수 있다.
export async function runEnrichWorkerQueue<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
  concurrency: number,
  signal: AbortSignal,
): Promise<void> {
  if (items.length === 0) return;
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      if (signal.aborted) return;
      const idx = cursor++;
      await worker(items[idx]);
    }
  });
  await Promise.all(workers);
}
