/**
 * 계획을 덮어쓰기 «전에» 완주를 적는다 — savePlan · clearPlan.
 *
 * 완주는 따로 저장된 사건이 아니라 lists 의 계획 칸에서 파생되는 상태다(computePlanStatus).
 * 그래서 planStartedAt 을 바꾸거나 지우는 쓰기가 기록보다 먼저 가면 그 완주는 «없던 일»이 된다.
 * 평소엔 완주한 순간(updatePlanProgress)에 이미 적혀 있지만, 다른 기기의 완주가 동기화로 들어온
 * 단어장은 다음 앱 시작의 백필 전까지 줄이 없다. 그 사이에 새 계획을 세우는 문이 둘이다 —
 * 홈 학습결과 시트의 「새 계획 세우기」와 단어장 헤더의 「계획하기」(완주한 계획).
 *
 * SQL 자체(완주 상태일 때만 넣는다 · PK 로 중복 무시)는 completion-certificate.test.ts 가 실제
 * SQLite 로 검증한다. 여기서는 «부르는가, 덮어쓰기보다 먼저인가» 하나만 본다.
 */
const mockRecordCompletion = jest.fn(async (_listId: string) => {});
const mockRunAsync = jest.fn(async (_sql: string, _args?: unknown[]) => {});

// db.ts 가 id 생성용으로 불러오는 네이티브 모듈 — 이 스위트는 id 를 만들지 않는다.
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }));
jest.mock('@/features/stats', () => ({
  recordCompletion: (listId: string) => mockRecordCompletion(listId),
  recordMemorizedWords: async () => {},
}));
jest.mock('@/lib/db', () => ({
  getDb: async () => ({ runAsync: mockRunAsync }),
  runInTransaction: async (fn: () => Promise<void>) => fn(),
}));

import { savePlan, clearPlan } from '@/features/vocab/db';

function orderOf(fn: jest.Mock, pred: (args: any[]) => boolean): number {
  const i = fn.mock.calls.findIndex(pred);
  expect(i).toBeGreaterThanOrEqual(0);
  return fn.mock.invocationCallOrder[i];
}

const rewritesPlan = (args: any[]) => /UPDATE lists SET planTotalDays/.test(args[0]);

beforeEach(() => {
  mockRecordCompletion.mockClear();
  mockRunAsync.mockClear();
});

describe('계획을 덮어쓰기 전에 완주를 적는다', () => {
  it('🔴 savePlan — 새 계획이 planStartedAt 을 바꾸기 전에 기록한다', async () => {
    await savePlan('L1', 10, [{ wordId: 'w1', day: 1 }], 1);
    expect(mockRecordCompletion).toHaveBeenCalledWith('L1');
    expect(orderOf(mockRecordCompletion, () => true)).toBeLessThan(orderOf(mockRunAsync, rewritesPlan));
  });

  it('clearPlan — 계획을 지우기 전에 기록한다', async () => {
    await clearPlan('L2');
    expect(mockRecordCompletion).toHaveBeenCalledWith('L2');
    expect(orderOf(mockRecordCompletion, () => true)).toBeLessThan(orderOf(mockRunAsync, rewritesPlan));
  });
});
