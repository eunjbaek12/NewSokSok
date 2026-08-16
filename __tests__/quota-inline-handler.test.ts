// 한도 초과 안내를 **화면이 직접 맡는** 경로 (features/quota/store.ts)
//
// 왜 이 테스트가 있나: 2026-08-17, iOS에서 AI 단어 생성 모달 안에서 한도를 넘기면 앱이
// 강제 종료 전까지 먹통이 됐다. 원인은 앱 루트의 보상형 광고 모달이 이미 떠 있는 RN Modal
// 의 형제라, iOS가 그 present를 처리하지 못하는 것이었다(RN은 실패를 모른 채 "떠 있음"으로
// 기록해 두 번 다시 띄우지도 닫지도 않는다). 그래서 모달 안에서 도는 화면은
// inlineQuotaHandler 를 등록하고, 등록이 있으면 store 는 전역 모달을 켜지 않는다.
//
// 이 분기가 조용히 무너지면 증상이 "앱이 멈춘다"로 나타나고 로그에도 남지 않는다.

jest.mock('@/lib/supabase/client', () => ({
  supabase: { auth: { getUser: jest.fn() }, rpc: jest.fn() },
}));

import { useQuotaStore, type QuotaStatus } from '@/features/quota/store';
import { getQuotaLeft } from '@/features/quota/reward-eligibility';

function status(over: Partial<QuotaStatus> = {}): QuotaStatus {
  return {
    tier: 'free',
    used: 0,
    limit: 50,
    bonus: 0,
    trial_ends_at: null,
    pro_until: null,
    reset_at: new Date().toISOString(),
    ...over,
  };
}

beforeEach(() => {
  useQuotaStore.setState({
    status: null,
    quotaExceededAt: 0,
    proLimitReachedAt: 0,
    inlineQuotaHandler: null,
    retryAfterReward: null,
  });
});

describe('notifyQuotaExceeded — 전역 모달 vs 인라인 위임', () => {
  it('등록된 화면이 없으면 지금까지처럼 전역 모달을 켠다', () => {
    useQuotaStore.getState().notifyQuotaExceeded(status({ used: 50 }));
    expect(useQuotaStore.getState().quotaExceededAt).toBeGreaterThan(0);
    expect(useQuotaStore.getState().proLimitReachedAt).toBe(0);
  });

  it('Pro 는 광고가 아니라 Pro 안내 모달로 간다', () => {
    useQuotaStore.getState().notifyQuotaExceeded(status({ tier: 'pro', used: 3000, limit: 3000 }));
    expect(useQuotaStore.getState().proLimitReachedAt).toBeGreaterThan(0);
    expect(useQuotaStore.getState().quotaExceededAt).toBe(0);
  });

  it('화면이 등록돼 있으면 전역 모달을 켜지 않고 그 화면에 넘긴다 (iOS 먹통 방지)', () => {
    const handler = jest.fn();
    useQuotaStore.getState().setInlineQuotaHandler(handler);

    useQuotaStore.getState().notifyQuotaExceeded(status({ used: 50 }));

    expect(handler).toHaveBeenCalledWith({ kind: 'ad' });
    expect(useQuotaStore.getState().quotaExceededAt).toBe(0);
    expect(useQuotaStore.getState().proLimitReachedAt).toBe(0);
  });

  it('Pro 도 마찬가지로 위임한다 — Pro 안내 모달 역시 루트의 형제 Modal 이다', () => {
    const handler = jest.fn();
    useQuotaStore.getState().setInlineQuotaHandler(handler);

    useQuotaStore.getState().notifyQuotaExceeded(status({ tier: 'pro', used: 3000, limit: 3000 }));

    expect(handler).toHaveBeenCalledWith({ kind: 'pro' });
    expect(useQuotaStore.getState().proLimitReachedAt).toBe(0);
  });

  it('위임하더라도 응답에 실린 quota 는 반영한다 — 화면이 곧바로 남은 양을 다시 읽는다', () => {
    const seen: (number | null)[] = [];
    useQuotaStore.getState().setInlineQuotaHandler(() => {
      seen.push(getQuotaLeft(useQuotaStore.getState().status));
    });

    useQuotaStore.getState().notifyQuotaExceeded(status({ used: 48, limit: 50 }));

    expect(useQuotaStore.getState().status?.used).toBe(48);
    expect(seen).toEqual([2]); // 핸들러가 불린 시점에 이미 갱신돼 있어야 한다
  });

  it('등록을 거둔 뒤에는 다시 전역 모달로 돌아간다', () => {
    const handler = jest.fn();
    useQuotaStore.getState().setInlineQuotaHandler(handler);
    useQuotaStore.getState().setInlineQuotaHandler(null);

    useQuotaStore.getState().notifyQuotaExceeded(status({ used: 50 }));

    expect(handler).not.toHaveBeenCalled();
    expect(useQuotaStore.getState().quotaExceededAt).toBeGreaterThan(0);
  });

  it('로그아웃(clear)은 등록도 함께 비운다 — 사라진 화면의 핸들러가 남으면 안내가 통째로 사라진다', () => {
    useQuotaStore.getState().setInlineQuotaHandler(jest.fn());
    useQuotaStore.getState().clear();
    expect(useQuotaStore.getState().inlineQuotaHandler).toBeNull();
  });
});

describe('getQuotaLeft', () => {
  it('일반 사용자는 일일 한도 + 보너스에서 사용분을 뺀 값', () => {
    expect(getQuotaLeft(status({ used: 35, limit: 50, bonus: 20 }))).toBe(35);
    expect(getQuotaLeft(status({ tier: 'guest', used: 10, limit: 10 }))).toBe(0);
  });

  it('한도를 넘겨 쓴 상태에서도 음수를 주지 않는다', () => {
    expect(getQuotaLeft(status({ used: 60, limit: 50 }))).toBe(0);
  });

  it('Pro 는 일일·월간 중 더 빡빡한 쪽 — 월말에 일일만 보면 잔량을 크게 오판한다', () => {
    const proNearMonthlyCap = status({
      tier: 'pro', used: 0, limit: 3000, month_used: 2990, month_limit: 3000,
    });
    expect(getQuotaLeft(proNearMonthlyCap)).toBe(10);

    const proFreshMonth = status({
      tier: 'pro', used: 100, limit: 3000, month_used: 100, month_limit: 3000,
    });
    expect(getQuotaLeft(proFreshMonth)).toBe(2900);
  });

  it('월간 카운터가 없는 옛 응답은 일일 기준으로 떨어진다', () => {
    expect(getQuotaLeft(status({ tier: 'pro', used: 500, limit: 3000 }))).toBe(2500);
  });

  it('status 가 아직 없으면 0 이 아니라 null — "모른다"로 사용자를 막지 않는다', () => {
    expect(getQuotaLeft(null)).toBeNull();
    expect(getQuotaLeft(undefined)).toBeNull();
  });
});
