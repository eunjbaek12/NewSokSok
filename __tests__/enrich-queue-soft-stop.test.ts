/**
 * [중단]의 의미 — **새 요청을 내지 않는다**(하드 abort 가 아니다).
 *
 * 왜 테스트로 붙드나: 서버는 AI 를 부르기 **전에** 차감한다(consume_ai_quota → Vertex).
 * 그래서 진행 중인 요청을 끊으면 그 단어는 차감만 되고 사라진다 — 동시성이 4니 [중단] 한
 * 번에 최대 4단어다. 화면은 「2개를 채웠어요」인데 한도는 6이 줄어 있었다. 이건 코드를 읽어서
 * 보이는 결함이 아니라 **경계의 뜻**이라, 규칙을 문장으로 못 박아 둔다:
 *
 *   차감된 것은 반드시 받는다. 아직 차감 안 된 것(429 대기)은 버린다.
 */

import {
  runEnrichBatchWithRecovery,
  abortableDelay,
  RateLimitedError,
  type EnrichQueueItem,
} from '../lib/enrich-queue-core';

const item = (n: number): EnrichQueueItem => ({ id: `id-${n}`, term: `term-${n}` });
const items = (n: number) => Array.from({ length: n }, (_, i) => item(i));
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

type Result = { meaningKr: string };
const OK: Result = { meaningKr: '뜻' };

/** 신호를 실제로 듣는 enrich — 진짜 fetch 처럼 AbortError 로 죽는다. */
function abortableEnrich(ms: number, started: string[]) {
  return (it: EnrichQueueItem, signal: AbortSignal) =>
    new Promise<Result | null>((resolve, reject) => {
      started.push(it.id);
      const timer = setTimeout(() => { cleanup(); resolve(OK); }, ms);
      const onAbort = () => {
        cleanup();
        const e = new Error('aborted');
        e.name = 'AbortError';
        reject(e);
      };
      function cleanup() {
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
      }
      signal.addEventListener('abort', onAbort, { once: true });
    });
}

describe('stopSignal — 부드러운 중단', () => {
  it('새 작업은 시작하지 않지만, 이미 나간 요청의 결과는 **전부** 통지한다', async () => {
    const started: string[] = [];
    const delivered: string[] = [];
    const stop = new AbortController();

    const run = runEnrichBatchWithRecovery<Result>(
      items(8),
      abortableEnrich(40, started),
      (id, result, final) => { if (final && result) delivered.push(id); },
      2,
      new AbortController().signal,
      { stopSignal: stop.signal },
    );
    setTimeout(() => stop.abort(), 15);
    await run;

    // 동시성만큼만 나갔고(= 차감된 것도 그만큼),
    expect(started).toHaveLength(2);
    // 나간 것은 하나도 안 잃었다. 이 줄이 깨지면 사용자는 한도만 쓰고 단어를 못 받는다.
    expect(delivered.sort()).toEqual(started.sort());
  });

  it('🔴 하드 abort 는 진행 중이던 것을 잃는다 — [중단]이 이 경로를 타면 안 된다', async () => {
    const started: string[] = [];
    const delivered: string[] = [];
    const hard = new AbortController();

    const run = runEnrichBatchWithRecovery<Result>(
      items(8),
      abortableEnrich(40, started),
      (id, result, final) => { if (final && result) delivered.push(id); },
      2,
      hard.signal,
    );
    setTimeout(() => hard.abort(), 15);
    await run;

    expect(started).toHaveLength(2);
    expect(delivered).toHaveLength(0); // 차감은 됐는데 받은 것이 없다
  });

  it('중단 뒤 2차 패스를 돌지 않는다 — 새 요청이니까', async () => {
    const started: string[] = [];
    const stop = new AbortController();

    await runEnrichBatchWithRecovery<Result>(
      items(2),
      async (it) => { started.push(it.id); stop.abort(); return null; },
      () => {},
      1,
      new AbortController().signal,
      { stopSignal: stop.signal },
    );

    // 첫 단어에서 멈췄으므로 둘째도, 2차 패스도 없다.
    expect(started).toEqual(['id-0']);
  });

  it('중단 뒤 도착한 실패도 final 로 올린다 — 재시도가 없으니 그것이 마지막 답이다', async () => {
    const finals: Array<[string, boolean]> = [];
    const stop = new AbortController();

    await runEnrichBatchWithRecovery<Result>(
      items(1),
      async () => { stop.abort(); return null; },
      (id, _r, final) => finals.push([id, final]),
      1,
      new AbortController().signal,
      { stopSignal: stop.signal },
    );

    expect(finals).toEqual([['id-0', true]]);
  });
});

describe('429 대기 — 차감 전이라 붙들지 않는다', () => {
  it('stopSignal 이면 retry_after 를 기다리지 않고 즉시 접는다', async () => {
    const stop = new AbortController();
    const started = new Date().getTime();

    const run = runEnrichBatchWithRecovery<Result>(
      items(1),
      async () => { throw new RateLimitedError(30); }, // 30초를 기다리라고 한다
      () => {},
      1,
      new AbortController().signal,
      { stopSignal: stop.signal },
    );
    setTimeout(() => stop.abort(), 20);
    await run;

    // 30초가 아니라 즉시 끝나야 한다. 안 그러면 [중단]이 최대 60초 걸린다.
    expect(new Date().getTime() - started).toBeLessThan(2000);
  });

  it('onWait 은 시작(초)과 끝(null)이 짝을 이룬다 — 안 그러면 「기다리는 중」이 안 사라진다', async () => {
    const waits: Array<number | null> = [];
    let first = true;

    await runEnrichBatchWithRecovery<Result>(
      items(1),
      async () => {
        if (first) { first = false; throw new RateLimitedError(0); }
        return OK;
      },
      () => {},
      1,
      new AbortController().signal,
      { onWait: (sec) => waits.push(sec) },
    );

    expect(waits).toEqual([0, null]);
  });

  it('429 를 기다린 뒤 같은 단어를 다시 부른다(버리지 않는다)', async () => {
    const calls: string[] = [];
    const delivered: Array<Result | null> = [];
    let first = true;

    await runEnrichBatchWithRecovery<Result>(
      items(1),
      async (it) => {
        calls.push(it.id);
        if (first) { first = false; throw new RateLimitedError(0); }
        return OK;
      },
      (_id, result) => delivered.push(result),
      1,
      new AbortController().signal,
    );

    expect(calls).toEqual(['id-0', 'id-0']);
    expect(delivered).toEqual([OK]);
  });
});

describe('abortableDelay — 신호가 여럿', () => {
  it('둘 중 어느 것이 abort 돼도 즉시 깨어난다', async () => {
    for (const which of [0, 1]) {
      const a = new AbortController();
      const b = new AbortController();
      const t0 = new Date().getTime();
      const p = abortableDelay(5000, a.signal, b.signal);
      setTimeout(() => (which === 0 ? a : b).abort(), 10);
      await p;
      expect(new Date().getTime() - t0).toBeLessThan(1000);
    }
  });

  it('undefined 신호는 무시한다', async () => {
    const t0 = new Date().getTime();
    await abortableDelay(10, undefined);
    expect(new Date().getTime() - t0).toBeGreaterThanOrEqual(5);
  });

  it('이미 abort 된 신호가 섞여 있으면 즉시 resolve', async () => {
    const done = new AbortController();
    done.abort();
    const t0 = new Date().getTime();
    await abortableDelay(5000, new AbortController().signal, done.signal);
    expect(new Date().getTime() - t0).toBeLessThan(500);
  });
});

describe('기존 동작은 그대로', () => {
  it('opts 를 안 주면 예전처럼 전부 처리한다', async () => {
    const delivered: string[] = [];
    await runEnrichBatchWithRecovery<Result>(
      items(5),
      async () => { await delay(1); return OK; },
      (id, _r, final) => { if (final) delivered.push(id); },
      2,
      new AbortController().signal,
    );
    expect(delivered).toHaveLength(5);
  });
});
