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
  /**
   * [중단]을 눌렀고 **이미 나간 요청을 받는 중**이다. `running` 은 아직 참이다 —
   * 배치가 끝난 것이 아니라 새 요청을 안 낼 뿐이기 때문이다.
   */
  stopping: boolean;
  /** 429 로 쉬는 중이면 다시 부를 시각(epoch ms). 남은 초는 화면이 센다. */
  waitingUntil: number | null;
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

const IDLE: BareFillState = { running: false, stopping: false, waitingUntil: null, filled: 0, total: 0, currentTerm: null, notFound: [], outcome: null };

export interface BareFillOptions {
  /**
   * 이 단어를 "채웠다"로 셀 것인가. 기본은 **한 칸이라도 찼으면** 센다.
   *
   * 🔴 호출부가 정해야 하는 이유: 무엇을 채우러 왔는지가 화면마다 다르다. 예문 학습은
   * 예문을 받으러 왔으므로 발음만 차고 예문이 안 오면 그건 0개다 — 기본 규칙으로 세면
   * 「12개를 채웠어요」가 거짓이 된다(docs/example-study-consent-spec.md §5).
   */
  countsAsFilled?: (updates: Partial<Word>) => boolean;
}

export function useBareFill(
  listId: string,
  list: VocaList | undefined,
  /** 단어장 대표 언어 — 단어에 값이 없을 때만 쓴다(deriveDisplayLanguages 결과). */
  fallbackLangs: { source: string; target: string },
  apiKey: string | undefined,
  options?: BareFillOptions,
) {
  const [state, setState] = useState<BareFillState>(IDLE);
  /**
   * 신호가 둘인 이유 — **[중단]은 하드 abort 가 아니다.**
   *
   * 서버는 AI 를 부르기 **전에** 차감한다(consume_ai_quota → Vertex). 그래서 진행 중인 요청을
   * 끊으면 그 단어는 차감만 되고 사라진다 — 동시성이 4니 [중단] 한 번에 최대 4단어다.
   * 실제로 화면은 「2개를 채웠어요」인데 한도는 6이 줄어 있을 수 있었다.
   *
   *   stopRef  — [중단]. 새 요청을 내지 않되 **이미 나간 것은 받아서 저장한다.**
   *   abortRef — 진짜 teardown. 받을 사람이 없을 때만 끊는다. 재진입 가드도 겸한다.
   */
  const abortRef = useRef<AbortController | null>(null);
  const stopRef = useRef<AbortController | null>(null);
  /** 429 로 쉬는 워커 수. 여럿이 동시에 걸릴 수 있어 세어야 한다. */
  const waitingRef = useRef(0);
  // 매 렌더 새 함수라 의존성에 넣을 수 없다 — 최신 것을 ref 로 가리킨다(useRewardedAd 와 같은 갈래).
  const countsRef = useRef(options?.countsAsFilled);
  countsRef.current = options?.countsAsFilled;

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

  /**
   * [중단] — **새 요청을 내지 않는다**는 뜻이다.
   *
   * 이미 나간 fetch 는 그대로 응답을 받아 저장한다(**차감된 것은 반드시 받는다**). 429 로
   * 기다리던 것은 즉시 버린다 — 아직 차감 전이라(서버가 rate-limit 를 차감 앞에서 판정한다)
   * 잃는 것이 없고, 그것까지 붙들면 중단이 최대 60초 걸린다.
   */
  const stop = useCallback(() => {
    if (!stopRef.current || stopRef.current.signal.aborted) return;
    stopRef.current.abort();
    setState(prev => (prev.running ? { ...prev, stopping: true, waitingUntil: null } : prev));
  }, []);

  /** 화면이 사라진다 — 받을 사람이 없으므로 진짜로 끊는다. */
  const teardown = useCallback(() => {
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
    const stopper = new AbortController();
    abortRef.current = controller;
    stopRef.current = stopper;
    waitingRef.current = 0;
    setState({ running: true, stopping: false, waitingUntil: null, filled: 0, total: batch.length,
      currentTerm: batch[0].term, notFound: [], outcome: null });

    const byId = new Map(batch.map(w => [w.id, w]));
    /**
     * 저장 약속들.
     *
     * 🔴 **"배치가 끝났다"는 저장까지 끝난 것이어야 한다.** 예전에는 updateWord 를 던져만
     * 놓고(void) 큐가 비는 순간 끝났다고 알렸는데, 그러면 마지막 몇 건의 쓰기가 아직 스토어에
     * 도착하기 전이다. 실기에서 7개를 채우고 「7개를 채웠어요」가 뜬 순간 학습에 들어온 것은
     * **4개뿐**이었다(나머지 셋은 그 뒤에 도착). 결과를 보고 무언가를 세는 화면은 전부 이
     * 경계를 믿으므로, 여기서 기다린다.
     */
    const writes: Promise<unknown>[] = [];
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

      // 세는 기준은 호출부의 것이다(BareFillOptions.countsAsFilled). 안 세는 경우에도
      // 저장은 한다 — 받은 값을 버릴 이유가 없고, 한도는 이미 그 단어에 쓰였다.
      if (countsRef.current ? countsRef.current(updates) : true) filled += 1;
      setState(prev => (prev.running ? { ...prev, filled, currentTerm: target.term } : prev));
      // 저장 실패가 배치를 멈추지 않게 한다 — 한 단어 때문에 나머지를 버릴 이유가 없다.
      writes.push(updateWord(listId, id, updates).catch(() => {}));
    };

    /**
     * 429 로 쉬는 동안을 화면에 올린다.
     *
     * 🔑 이것이 없으면 「apple 채우는 중…」이 최대 60초 얼어붙어 **고장으로 보인다.** 큐는
     * 멀쩡히 기다렸다 다시 부르는데 화면만 그 사실을 모른다.
     * 🔴 워커가 여럿이라 세어야 한다 — 하나가 깨어났다고 «기다림 끝»이라고 하면 아직 자는
     * 워커가 있는데 진행 중으로 보인다.
     */
    const onWait = (sec: number | null) => {
      if (sec != null) {
        waitingRef.current += 1;
        const until = Date.now() + sec * 1000;
        setState(prev => (prev.running ? { ...prev, waitingUntil: until } : prev));
        return;
      }
      waitingRef.current = Math.max(0, waitingRef.current - 1);
      if (waitingRef.current === 0) {
        setState(prev => (prev.running ? { ...prev, waitingUntil: null } : prev));
      }
    };

    try {
      await runEnrichBatchWithRecovery<AutoFillResult>(
        batch.map(w => ({ id: w.id, term: w.term })),
        enrich,
        onResult,
        CONCURRENCY,
        controller.signal,
        { stopSignal: stopper.signal, onWait },
      );
    } finally {
      // 위 주석의 이유로 저장을 먼저 기다린다. 실패는 이미 삼켰으므로 여기서 터지지 않는다.
      await Promise.all(writes);
      const stopped = stopper.signal.aborted || controller.signal.aborted;
      abortRef.current = null;
      stopRef.current = null;
      waitingRef.current = 0;
      // 끝난 이유: 멈췄으면 stopped, 한도로 잘렸으면 quota, 아니면 done.
      const outcome: BareFillOutcome = stopped
        ? 'stopped'
        : batch.length < targets.length
          ? 'quota'
          : 'done';
      // 다음 배치부터 이 단어들을 건너뛴다 — 안 그러면 오래된 순 맨 앞을 영구히 차지한다.
      if (notFoundIds.length > 0) void markUnfillable(notFoundIds);
      setState({ running: false, stopping: false, waitingUntil: null, filled, total: batch.length,
        currentTerm: null, notFound: notFoundTerms, outcome });
    }
  }, [apiKey, fallbackLangs.source, fallbackLangs.target, list, listId, quotaLeft]);

  /**
   * 배너·칩의 결과를 지운다(닫았거나 다음 배치를 시작할 때).
   *
   * 🔴 `notFound` 도 같이 지운다. 얼굴 판정에서 못 찾음은 outcome 과 **무관하게** 앞서므로
   * (face.ts), outcome 만 비우면 「채우지 못한 단어 2개」가 영원히 남는다 — 닫아도 안 닫혔다.
   */
  const clearOutcome = useCallback(() => {
    setState(prev => (prev.outcome || prev.notFound.length > 0
      ? { ...prev, outcome: null, notFound: [] }
      : prev));
  }, []);

  return { ...state, fill, stop, teardown, clearOutcome, quotaLeft };
}
