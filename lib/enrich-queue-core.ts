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

/** ms 대기하되 signal abort 시 즉시 resolve(다음 루프의 aborted 체크가 중단 처리). */
export function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) { resolve(); return; }
    const timer = setTimeout(finish, ms);
    function finish() {
      signal.removeEventListener('abort', finish);
      clearTimeout(timer);
      resolve();
    }
    signal.addEventListener('abort', finish, { once: true });
  });
}

const MAX_RETRY_AFTER_SEC = 60; // rate limit 윈도(60초) 이상 기다릴 이유 없음
const DEFAULT_RETRY_AFTER_SEC = 15;

// 1회 시도 + 429면 retry_after 대기 후 1회 재시도. 실패는 null.
// AbortError만 위로 던진다(워커 루프가 중단 처리).
async function attemptWithRateLimitRetry<R>(
  item: EnrichQueueItem,
  enrich: EnrichAttempt<R>,
  signal: AbortSignal,
): Promise<R | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await enrich(item, signal);
    } catch (e: any) {
      if (e?.name === 'AbortError') throw e;
      if (e instanceof RateLimitedError && attempt === 0 && !signal.aborted) {
        const sec = Math.min(e.retryAfter ?? DEFAULT_RETRY_AFTER_SEC, MAX_RETRY_AFTER_SEC);
        await abortableDelay(sec * 1000, signal);
        if (signal.aborted) return null;
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
): Promise<void> {
  if (items.length === 0) return;

  const failed: EnrichQueueItem[] = [];

  const runPass = async (passItems: EnrichQueueItem[], isFinalPass: boolean) => {
    let cursor = 0;
    const workers = Array.from({ length: Math.min(concurrency, passItems.length) }, async () => {
      while (cursor < passItems.length) {
        if (signal.aborted) return;
        const item = passItems[cursor++];
        let result: R | null;
        try {
          result = await attemptWithRateLimitRetry(item, enrich, signal);
        } catch {
          return; // AbortError — 배치 자체가 중단됨
        }
        if (result === null && !isFinalPass) {
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
  if (failed.length > 0 && !signal.aborted) {
    await runPass(failed, true);
  }
}
