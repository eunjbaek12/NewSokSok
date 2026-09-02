// 배치 보강(사진·일괄 추가) 큐의 순수 알고리즘 — RN/expo 의존 없음(jest 대상).
// useEnrichQueue가 enrichWord를 주입해 사용한다.
//
// 배경(2026-07-11 사진 스캔 "인식은 되는데 정보 없음" 진단):
// 클라이언트가 타임아웃으로 포기한 단어도 서버(Edge)는 계속 진행해 공용 캐시에
// 저장하고 quota를 차감한다. 실측: "cycle"이 클라 실패로 표시된 순간 서버 캐시엔
// 완전한 결과가 있었다. 그래서 실패분을 배치 끝에 한 번 더 돌리면(2차 패스)
// 캐시 히트로 즉시·무차감 회복된다. 429(rate limit)는 서버가 retry_after를
// 주므로 그만큼 대기 후 같은 단어를 1회 재시도한다.

export class RateLimitedError extends Error {
  constructor(public readonly retryAfter?: number) {
    super('rate_limited');
    this.name = 'RateLimitedError';
  }
}

export interface EnrichQueueItem {
  id: string;
  term: string;
}

export type EnrichAttempt<R> = (item: EnrichQueueItem, signal: AbortSignal) => Promise<R | null>;

/**
 * 아이템 처리 결과 통지. final=false는 "1차 실패, 2차 패스에서 재시도 예정" —
 * 호출자는 카드 상태만 갱신하고 진행 카운터는 유지해야 한다(저장 버튼 잠금).
 */
export type EnrichResultCallback<R> = (id: string, result: R | null, final: boolean) => void;

/**
 * ms 대기하되 **어느 신호든** abort 되면 즉시 resolve(다음 루프의 aborted 체크가 중단 처리).
 *
 * 신호를 여럿 받는 이유는 [중단]이 두 갈래이기 때문이다 — 아래 BatchStopOptions 참고.
 * 429 대기는 **부드러운 중단에도 즉시 깨야 한다**: 기다리는 단어는 아직 차감 전이라
 * (서버가 rate-limit 를 consume_ai_quota 앞에서 판정한다) 기다려 봐야 얻을 것이 없고,
 * 그것까지 붙들면 [중단]이 최대 60초 걸린다.
 */
export function abortableDelay(ms: number, ...signals: (AbortSignal | undefined)[]): Promise<void> {
  const live = signals.filter((s): s is AbortSignal => !!s);
  return new Promise((resolve) => {
    if (live.some(s => s.aborted)) { resolve(); return; }
    const timer = setTimeout(finish, ms);
    function finish() {
      live.forEach(s => s.removeEventListener('abort', finish));
      clearTimeout(timer);
      resolve();
    }
    live.forEach(s => s.addEventListener('abort', finish, { once: true }));
  });
}

/**
 * 배치를 멈추는 두 가지 방식과, 기다리는 동안을 알리는 통로.
 *
 * 🔴 **[중단]은 하드 abort 가 아니다.** 하드로 끊으면 이미 나간 요청이 AbortError 로 죽고
 * 그 결과가 버려지는데, 서버는 **AI 를 부르기 전에 차감**하므로(consume_ai_quota → Vertex)
 * 그만큼이 조용히 사라진다. 동시성이 4면 [중단] 한 번에 최대 4단어를 잃는다 — 화면은
 * 「2개를 채웠어요」인데 한도는 6이 줄어 있다.
 *
 * 그래서 규칙을 이렇게 세운다: **차감된 것은 반드시 받는다.**
 *   - `stopSignal` = "새 요청을 내지 않는다". 이미 나간 fetch 는 그대로 응답을 받는다.
 *   - `signal`     = 진짜 teardown(화면이 사라짐). 이때는 받을 사람이 없으므로 끊는다.
 */
export interface BatchStopOptions {
  /** [중단] — 새 작업을 시작하지 않는다. 진행 중인 요청은 끝까지 받는다. */
  stopSignal?: AbortSignal;
  /**
   * 429 로 쉬는 동안을 알린다. 시작할 때 남은 초, 끝나면 `null`.
   * 화면이 이걸 안 쓰면 「채우는 중」이 최대 60초 얼어붙어 **고장으로 보인다.**
   */
  onWait?: (retryAfterSec: number | null) => void;
}

const MAX_RETRY_AFTER_SEC = 60; // rate limit 윈도(60초) 이상 기다릴 이유 없음
const DEFAULT_RETRY_AFTER_SEC = 15;

// 1회 시도 + 429면 retry_after 대기 후 1회 재시도. 실패는 null.
// AbortError만 위로 던진다(워커 루프가 중단 처리).
async function attemptWithRateLimitRetry<R>(
  item: EnrichQueueItem,
  enrich: EnrichAttempt<R>,
  signal: AbortSignal,
  stop?: AbortSignal,
  onWait?: (retryAfterSec: number | null) => void,
): Promise<R | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await enrich(item, signal);
    } catch (e: any) {
      if (e?.name === 'AbortError') throw e;
      if (e instanceof RateLimitedError && attempt === 0 && !signal.aborted && !stop?.aborted) {
        const sec = Math.min(e.retryAfter ?? DEFAULT_RETRY_AFTER_SEC, MAX_RETRY_AFTER_SEC);
        // 🔑 기다린다는 사실을 밖으로 알린다. finally 로 짝을 맞춰야 예외가 나도 「기다리는 중」이
        // 화면에 남지 않는다.
        onWait?.(sec);
        try {
          await abortableDelay(sec * 1000, signal, stop);
        } finally {
          onWait?.(null);
        }
        if (signal.aborted || stop?.aborted) return null;
        continue;
      }
      return null;
    }
  }
  return null;
}

/**
 * 워커 concurrency개로 items를 보강하고, 1차 실패분을 모아 배치 끝에 2차 패스
 * 1회를 돌린다(클라 타임아웃 후 서버가 완료·캐시한 단어의 회복 경로).
 * onResult는 아이템당 1회(성공) 또는 2회(1차 null → 2차 결과) 불린다.
 */
export async function runEnrichBatchWithRecovery<R>(
  items: EnrichQueueItem[],
  enrich: EnrichAttempt<R>,
  onResult: EnrichResultCallback<R>,
  concurrency: number,
  signal: AbortSignal,
  opts?: BatchStopOptions,
): Promise<void> {
  if (items.length === 0) return;

  const stop = opts?.stopSignal;
  // 새 작업을 시작해도 되는가. teardown 이든 [중단]이든 여기서 멈춘다.
  const halted = () => signal.aborted || !!stop?.aborted;

  const failed: EnrichQueueItem[] = [];

  const runPass = async (passItems: EnrichQueueItem[], isFinalPass: boolean) => {
    let cursor = 0;
    const workers = Array.from({ length: Math.min(concurrency, passItems.length) }, async () => {
      while (cursor < passItems.length) {
        if (halted()) return;
        const item = passItems[cursor++];
        let result: R | null;
        try {
          result = await attemptWithRateLimitRetry(item, enrich, signal, stop, opts?.onWait);
        } catch {
          return; // AbortError — 배치 자체가 중단됨
        }
        // 🔑 [중단] 뒤에 도착한 응답도 통지한다 — **차감된 것은 반드시 받는다.**
        // 2차 패스는 돌지 않으므로(아래) 여기서는 final 로 올린다.
        if (result === null && !isFinalPass && !halted()) {
          failed.push(item);
          onResult(item.id, null, false);
        } else {
          onResult(item.id, result, true);
        }
      }
    });
    await Promise.all(workers);
  };

  await runPass(items, false);
  if (failed.length > 0 && !halted()) {
    await runPass(failed, true);
  }
}
