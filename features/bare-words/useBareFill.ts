/**
 * 뜻만 남은 단어를 배치로 채우는 실행부.
 *
 * 큐 알고리즘은 새로 짜지 않는다 — lib/enrich-queue-core.ts 를 그대로 쓴다
 * (429 대기·2차 패스·중단 내장). 동시성도 사진 스캔·일괄 추가와 같은 4다: 셋째 경로만
 * 다른 값을 쓸 근거가 없고, 캐시 시딩의 "2 초과 금지"는 스크립트가 수천 건을 한 번에
 * 쏟을 때의 교훈이지 앱 한 대의 얘기가 아니다.
 *
 * 🔴 hooks/useEnrichQueue 를 쓰지 않는 이유: 그 훅은 (sourceLang, targetLang)을 훅 호출
 * 시점에 고정한다. 이 기능의 대상은 **단어장 전체**이고 혼합 덱이 실재하므로, 배치 하나에
 * 언어가 다른 단어가 섞인다 — 고정하면 그중 일부를 엉뚱한 언어로 보강한다. 그래서 큐 코어를
 * 직접 부르고 언어는 **단어마다** 푼다(단어 값 → 단어장 대표값 순).
 *
 * 이 훅이 큐 위에 얹는 것은 셋뿐이다:
 *   1. 대상을 **남은 한도만큼** 자른다 — 넘겨 보내면 초과분이 조용히 실패한다.
 *   2. 결과를 updateWord 로 저장한다(경계 정제·dirty 표시가 거기 있다).
 *   3. 끝난 이유를 상태로 남긴다 — 다 채웠는지, 한도에 닿았는지, 사용자가 멈췄는지.
 *
 * 🔴 basic 폴백을 쓰지 않는다. 뜻은 이미 있으니 한도 소진 뒤에도 계속 부르면 아무것도
 * 안 채워지면서 호출만 나간다. 사진 스캔·AI 생성과 같은 하드스톱이 맞다.
 */

import { useCallback, useRef, useState } from 'react';
import { runEnrichBatchWithRecovery } from '@/lib/enrich-queue-core';
import { enrichWord } from '@/lib/translation-api';
import { useQuotaStore, getQuotaLeft } from '@/features/quota';
import { updateWord } from '@/features/vocab';
import { markUnfillable } from './unfillable';
import { fillableUpdates } from './merge';
import type { AutoFillResult, Word, VocaList } from '@/lib/types';

const CONCURRENCY = 4;

/** 배치가 끝난 이유. 화면은 이 값으로 배너의 얼굴을 고른다. */
export type BareFillOutcome =
  /** 고른 것을 전부 채웠다. */
  | 'done'
  /** 한도에 닿아 멈췄다 — 아직 남은 반쪽이 있다. */
  | 'quota'
  /** 사용자가 "중단"을 눌렀다. */
  | 'stopped';

export interface BareFillState {
  running: boolean;
  /** 이번 배치에서 실제로 채운 수. */
  filled: number;
  /** 이번 배치의 목표 수(= 잘라낸 대상 수). */
  total: number;
  /** 지금 채우는 중인 단어. 진행 줄에 쓴다. */
  currentTerm: string | null;
  /**
   * 이번 배치에서 **AI 가 찾지 못한** 단어들(표제어). 실패 배너가 이름을 대는 데 쓴다.
   * 🔴 네트워크 실패는 여기 들어오지 않는다 — isReal === false 만 담는다.
   */
  notFound: string[];
  outcome: BareFillOutcome | null;
}

const IDLE: BareFillState = { running: false, filled: 0, total: 0, currentTerm: null, notFound: [], outcome: null };

export function useBareFill(
  listId: string,
  list: VocaList | undefined,
  /** 단어장 대표 언어 — 단어에 값이 없을 때만 쓴다(deriveDisplayLanguages 결과). */
  fallbackLangs: { source: string; target: string },
  apiKey: string | undefined,
) {
  const [state, setState] = useState<BareFillState>(IDLE);
  const abortRef = useRef<AbortController | null>(null);

  /**
   * 지금 채울 수 있는 수. BYOK 는 앱 차원의 한도가 없으므로 제한하지 않는다.
   *
   * 🔴 getQuotaLeft 의 null 은 "모른다"(응답이 아직 안 옴)이지 0이 아니다. 여기서 0으로
   * 읽으면 멀쩡한 사용자가 "0개"를 본다 — 그래서 null 은 null 로 올려보내고, 화면이
   * "모름"으로 그린다.
   */
  const quotaLeft = useCallback((): number | null => {
    if (apiKey) return null; // BYOK = 무제한
    return getQuotaLeft(useQuotaStore.getState().status);
  }, [apiKey]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  /**
   * 고른 단어들을 채운다. `targets` 는 이미 순서가 정해져 있어야 한다
   * (기본은 오래 담아둔 것부터 — bareWordsOldestFirst).
   *
   * 🔴 재진입 가드에 `state.running` 을 쓰지 않는다. 보상형 광고의 onGranted 는
   * setLoading(false) **앞에서** 불리므로, 이 함수를 거기서 다시 부를 때 running 이
   * 아직 참이면 조용히 아무 일도 일어나지 않는다(사진 스캔에서 실제로 그랬다).
   * 진짜로 도는 중인지는 AbortController 존재로 판정한다.
   */
  const fill = useCallback(async (targets: Word[]): Promise<void> => {
    if (abortRef.current) return; // 이미 도는 중
    if (targets.length === 0) return;

    // 한도만큼 자른다. 넘겨 보내면 초과분이 조용히 실패하고 사용자는 이유를 모른다.
    const left = quotaLeft();
    const batch = left == null ? targets : targets.slice(0, Math.max(0, left));
    if (batch.length === 0) {
      setState({ ...IDLE, outcome: 'quota' });
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setState({ running: true, filled: 0, total: batch.length, currentTerm: batch[0].term, notFound: [], outcome: null });

    const byId = new Map(batch.map(w => [w.id, w]));
    let filled = 0;
    const notFoundIds: string[] = [];
    const notFoundTerms: string[] = [];

    // 언어는 단어가 정한다 — 없을 때만 단어장 대표값. 혼합 덱에서 한 쌍으로 고정하면
    // 그중 일부가 엉뚱한 언어로 보강된다.
    const enrich = (item: { id: string; term: string }, signal: AbortSignal) => {
      const w = byId.get(item.id);
      const source = w?.sourceLang ?? list?.sourceLanguage ?? fallbackLangs.source;
      const target = w?.targetLang ?? list?.targetLanguage ?? fallbackLangs.target;
      return enrichWord(item.term, source, target, apiKey, signal, 'autocomplete', undefined, { batch: true });
    };

    const onResult = (id: string, result: AutoFillResult | null, final: boolean) => {
      if (!final) return; // 1차 실패 — 2차 패스가 남았다
      const target = byId.get(id);
      if (!target) return;

      // 🔴 AI 가 "이건 단어가 아니다"라고 답한 경우만 기억한다(표제어 결함 포함).
      // result === null 은 네트워크·타임아웃이라 여기 오면 안 된다 — 그것으로 은퇴시키면
      // 한 번의 통신 실패로 멀쩡한 단어가 영구히 대상에서 빠진다.
      if (result?.isReal === false) {
        notFoundIds.push(id);
        notFoundTerms.push(target.term);
        return;
      }
      if (!result) return;

      // 빈 칸만 채운다. 규칙과 그 근거는 merge.ts 에 있다 — 여기 두면 조건 두 겹이
      // 훅 안 클로저에 갇혀 테스트로 붙들 수가 없다(face.ts 와 같은 이유).
      const updates = fillableUpdates(target, result);
      if (Object.keys(updates).length === 0) return;

      filled += 1;
      setState(prev => (prev.running ? { ...prev, filled, currentTerm: target.term } : prev));
      // 저장 실패가 배치를 멈추지 않게 한다 — 한 단어 때문에 나머지를 버릴 이유가 없다.
      void updateWord(listId, id, updates).catch(() => {});
    };

    try {
      await runEnrichBatchWithRecovery<AutoFillResult>(
        batch.map(w => ({ id: w.id, term: w.term })),
        enrich,
        onResult,
        CONCURRENCY,
        controller.signal,
      );
    } finally {
      const aborted = controller.signal.aborted;
      abortRef.current = null;
      // 끝난 이유: 멈췄으면 stopped, 한도로 잘렸으면 quota, 아니면 done.
      const outcome: BareFillOutcome = aborted
        ? 'stopped'
        : batch.length < targets.length
          ? 'quota'
          : 'done';
      // 다음 배치부터 이 단어들을 건너뛴다 — 안 그러면 오래된 순 맨 앞을 영구히 차지한다.
      if (notFoundIds.length > 0) void markUnfillable(notFoundIds);
      setState({ running: false, filled, total: batch.length, currentTerm: null,
        notFound: notFoundTerms, outcome });
    }
  }, [apiKey, fallbackLangs.source, fallbackLangs.target, list, listId, quotaLeft]);

  /** 배너를 닫거나 다음 배치를 시작할 때 결과 상태를 지운다. */
  const clearOutcome = useCallback(() => {
    setState(prev => (prev.outcome ? { ...prev, outcome: null } : prev));
  }, []);

  return { ...state, fill, stop, clearOutcome, quotaLeft };
}
