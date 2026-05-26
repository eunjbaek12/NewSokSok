// ① 순수 로직: trial / paid 구분 + 체험 잔여일 (features/quota/store.ts)
//
// 서버 RPC 는 trial 과 paid 를 모두 tier='pro' 로 반환한다. 이 둘을 구분하는 유일한
// 지점이 클라이언트의 getProMode 다. ("체험인데 결제된 것처럼 보이던" 과거 버그 지점.)
//
// store.ts 는 @/lib/supabase/client 를 import 하고, 그 client 는 react-native 의
// AppState 를 top-level 에서 건드려 jest(node) 에서 깨진다 → client 를 mock 한다.
// (getProMode / getTrialDaysLeft 자체는 supabase 를 쓰지 않는 순수 함수.)

jest.mock('@/lib/supabase/client', () => ({
  supabase: { auth: { getUser: jest.fn() }, rpc: jest.fn() },
}));

import { getProMode, getTrialDaysLeft, type QuotaStatus } from '@/features/quota/store';

const DAY = 24 * 60 * 60 * 1000;

function status(over: Partial<QuotaStatus> = {}): QuotaStatus {
  return {
    tier: 'pro',
    used: 0,
    limit: 1000,
    bonus: 0,
    trial_ends_at: null,
    pro_until: null,
    reset_at: new Date(Date.now() + DAY).toISOString(),
    ...over,
  };
}

describe('getProMode', () => {
  it('status 없음 → null', () => {
    expect(getProMode(null)).toBeNull();
  });

  it('tier=free → null (pro_until/trial 무시)', () => {
    expect(getProMode(status({ tier: 'free' }))).toBeNull();
  });

  it('유효한 pro_until → paid', () => {
    expect(getProMode(status({ pro_until: new Date(Date.now() + 30 * DAY).toISOString() }))).toBe('paid');
  });

  it('pro_until 만료 + trial 유효 → trial', () => {
    expect(getProMode(status({
      pro_until: new Date(Date.now() - DAY).toISOString(),
      trial_ends_at: new Date(Date.now() + 3 * DAY).toISOString(),
    }))).toBe('trial');
  });

  it('pro_until 과 trial 모두 만료 → null (tier=pro 인 좀비 상태)', () => {
    expect(getProMode(status({
      pro_until: new Date(Date.now() - DAY).toISOString(),
      trial_ends_at: new Date(Date.now() - DAY).toISOString(),
    }))).toBeNull();
  });

  it('pro_until 과 trial 둘 다 유효 → paid 우선', () => {
    expect(getProMode(status({
      pro_until: new Date(Date.now() + 30 * DAY).toISOString(),
      trial_ends_at: new Date(Date.now() + 3 * DAY).toISOString(),
    }))).toBe('paid');
  });
});

describe('getTrialDaysLeft', () => {
  it('trial_ends_at 없음 → null', () => {
    expect(getTrialDaysLeft(status())).toBeNull();
  });

  it('trial 이미 만료 → null', () => {
    expect(getTrialDaysLeft(status({ trial_ends_at: new Date(Date.now() - DAY).toISOString() }))).toBeNull();
  });

  it('정확히 now → null (잔여 시간 <= 0)', () => {
    // 약간의 실행 지연으로 now 직전이 되도록 1초 과거를 준다.
    expect(getTrialDaysLeft(status({ trial_ends_at: new Date(Date.now() - 1000).toISOString() }))).toBeNull();
  });

  it('1ms 후 만료 → 1 (부분 일은 올림, 최소 1)', () => {
    expect(getTrialDaysLeft(status({ trial_ends_at: new Date(Date.now() + 1).toISOString() }))).toBe(1);
  });

  it('약 3.5일 후 → 4 (ceil)', () => {
    expect(getTrialDaysLeft(status({ trial_ends_at: new Date(Date.now() + 3.5 * DAY).toISOString() }))).toBe(4);
  });

  it('정확히 7일 후 → 7', () => {
    // 캡처~함수 호출 사이 now 가 흐르면 잔여는 7일보다 살짝 작아져 ceil 은 7 유지.
    // (여유 ms 를 더하면 7일을 초과해 ceil=8 이 되므로 더하지 않는다.)
    expect(getTrialDaysLeft(status({ trial_ends_at: new Date(Date.now() + 7 * DAY).toISOString() }))).toBe(7);
  });
});
