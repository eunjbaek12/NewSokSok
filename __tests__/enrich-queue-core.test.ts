import {
  runEnrichBatchWithRecovery,
  abortableDelay,
  RateLimitedError,
  type EnrichQueueItem,
} from '../lib/enrich-queue-core';

const item = (n: number): EnrichQueueItem => ({ id: `id-${n}`, term: `term-${n}` });
const items = (n: number) => Array.from({ length: n }, (_, i) => item(i));

type Result = { meaningKr: string };
const OK: Result = { meaningKr: '뜻' };

describe('runEnrichBatchWithRecovery — 기본 워커 큐 동작', () => {
  it('items가 0개면 즉시 종료, enrich 호출 없음', async () => {
    const calls: string[] = [];
    await runEnrichBatchWithRecovery<Result>(
      [],
      async (it) => { calls.push(it.id); return OK; },
      () => {},
      4,
      new AbortController().signal,
    );
    expect(calls).toEqual([]);
  });

  it('concurrency 1이면 순차 실행, 전부 final 성공 통지', async () => {
    const order: string[] = [];
    const finals: Array<[string, boolean]> = [];
    await runEnrichBatchWithRecovery<Result>(
      items(4),
      async (it) => { order.push(it.id); return OK; },
      (id, result, final) => { finals.push([id, final]); expect(result).toEqual(OK); },
      1,
      new AbortController().signal,
    );
    expect(order).toEqual(['id-0', 'id-1', 'id-2', 'id-3']);
    expect(finals).toHaveLength(4);
    expect(finals.every(([, f]) => f)).toBe(true);
  });

  it('signal abort 시 남은 작업은 시작하지 않음', async () => {
    const calls: string[] = [];
    const controller = new AbortController();
    const promise = runEnrichBatchWithRecovery<Result>(
      items(8),
      async (it) => {
        calls.push(it.id);
        await new Promise(r => setTimeout(r, 30));
        return OK;
      },
      () => {},
      2,
      controller.signal,
    );
    setTimeout(() => controller.abort(), 15);
    await promise;
    expect(calls.length).toBeLessThan(8);
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe('runEnrichBatchWithRecovery — 2차 패스 회복', () => {
  it('1차 실패(null)는 final=false로 통지 후 배치 끝에 재시도, 캐시 히트 시나리오로 성공', async () => {
    // "cycle" 시나리오: 1차에서 타임아웃(null)이지만 서버는 완료·캐시 → 2차는 성공
    const attempts = new Map<string, number>();
    const notifications: Array<[string, Result | null, boolean]> = [];
    await runEnrichBatchWithRecovery<Result>(
      items(3),
      async (it) => {
        const n = (attempts.get(it.id) ?? 0) + 1;
        attempts.set(it.id, n);
        if (it.id === 'id-1' && n === 1) return null; // 1차만 실패
        return OK;
      },
      (id, result, final) => notifications.push([id, result, final]),
      2,
      new AbortController().signal,
    );
    // id-1: (null, final=false) → (OK, final=true) 두 번 통지
    const forId1 = notifications.filter(([id]) => id === 'id-1');
    expect(forId1).toEqual([['id-1', null, false], ['id-1', OK, true]]);
    expect(attempts.get('id-1')).toBe(2);
    // 성공 아이템은 1회씩만
    expect(notifications.filter(([id]) => id === 'id-0')).toHaveLength(1);
  });

  it('2차 패스도 실패하면 final=true의 null — 더는 재시도하지 않는다', async () => {
    let calls = 0;
    const finals: Array<[Result | null, boolean]> = [];
    await runEnrichBatchWithRecovery<Result>(
      [item(0)],
      async () => { calls += 1; return null; },
      (_id, result, final) => finals.push([result, final]),
      1,
      new AbortController().signal,
    );
    expect(calls).toBe(2); // 1차 + 2차, 그 이상 없음
    expect(finals).toEqual([[null, false], [null, true]]);
  });
});

describe('runEnrichBatchWithRecovery — 429 대기 후 재시도', () => {
  it('RateLimitedError면 retryAfter 대기 후 같은 단어를 1회 재시도해 성공시킨다', async () => {
    let calls = 0;
    const results: Array<Result | null> = [];
    const t0 = Date.now();
    await runEnrichBatchWithRecovery<Result>(
      [item(0)],
      async () => {
        calls += 1;
        if (calls === 1) throw new RateLimitedError(0.05); // 50ms 대기
        return OK;
      },
      (_id, result) => results.push(result),
      1,
      new AbortController().signal,
    );
    expect(calls).toBe(2);
    expect(results).toEqual([OK]);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(40);
  });

  it('재시도도 429면 null 실패로 넘긴다(무한 대기 없음) — 이후 2차 패스가 마지막 기회', async () => {
    let calls = 0;
    const finals: Array<[Result | null, boolean]> = [];
    await runEnrichBatchWithRecovery<Result>(
      [item(0)],
      async () => { calls += 1; throw new RateLimitedError(0.01); },
      (_id, result, final) => finals.push([result, final]),
      1,
      new AbortController().signal,
    );
    // 1차(시도+재시도) + 2차(시도+재시도) = 4회, 최종 null
    expect(calls).toBe(4);
    expect(finals[finals.length - 1]).toEqual([null, true]);
  });

  it('대기 중 abort되면 재시도 없이 종료한다', async () => {
    let calls = 0;
    const controller = new AbortController();
    const promise = runEnrichBatchWithRecovery<Result>(
      [item(0)],
      async () => { calls += 1; throw new RateLimitedError(10); }, // 10초 대기 요구
      () => {},
      1,
      controller.signal,
    );
    setTimeout(() => controller.abort(), 20);
    await promise;
    expect(calls).toBe(1); // 대기 중 중단 — 재시도 안 함
  });
});

describe('abortableDelay', () => {
  it('시간이 지나면 resolve', async () => {
    const t0 = Date.now();
    await abortableDelay(30, new AbortController().signal);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(20);
  });

  it('abort 시 즉시 resolve (reject 아님)', async () => {
    const controller = new AbortController();
    const t0 = Date.now();
    const p = abortableDelay(5000, controller.signal);
    setTimeout(() => controller.abort(), 10);
    await p;
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it('이미 aborted면 즉시 resolve', async () => {
    const controller = new AbortController();
    controller.abort();
    const t0 = Date.now();
    await abortableDelay(5000, controller.signal);
    expect(Date.now() - t0).toBeLessThan(100);
  });
});
