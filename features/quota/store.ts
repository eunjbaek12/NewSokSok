// v1.1 AI 단어 한도 + 구독 tier 전역 스토어.
//
// Edge Function `get_ai_quota_status` RPC를 통해 사용자별 일일 한도 / 사용량 /
// 트라이얼·Pro 만료일을 조회. 광고 가드, 한도 카운터 UI, 보상형 모달이 공유.
//
// 갱신 트리거:
//   1. 앱 시작 (refresh)
//   2. enrich 호출 성공/실패 후 (Edge 응답의 quota 사용해 set)
//   3. 보상형 광고 시청 완료 후 (refresh)
//   4. 화면 포커스 시 (Stale Time 90초)

import { create } from 'zustand';
import { supabase } from '@/lib/supabase/client';

export interface QuotaStatus {
  tier: 'guest' | 'free' | 'pro';
  used: number;
  limit: number;
  bonus: number;
  trial_ends_at: string | null;
  pro_until: string | null;
  reset_at: string;
  month_used?: number;
  month_limit?: number;
  reward_amount?: number;
  reward_views?: number;
  reward_max_views?: number;
  ad_free_until?: string | null;
}

/** 한도에 막힌 이유. 'ad' = 광고로 채울 수 있음(Free·게스트), 'pro' = 월 한도(광고 없음). */
export interface QuotaBlockInfo {
  kind: 'ad' | 'pro';
}

interface QuotaState {
  status: QuotaStatus | null;
  /** 구독 상품 ID(play_product_id). 결제 주기(월간/연간) 표시용. 유료 Pro에만 존재. */
  productId: string | null;
  loading: boolean;
  lastFetchedAt: number;
  /** Free 사용자의 quota_exceeded 시각. RewardedAdModal trigger. */
  quotaExceededAt: number;
  /** Pro 사용자의 quota_exceeded 시각. ProLimitReachedModal trigger (광고 X, 안내만). */
  proLimitReachedAt: number;
  /**
   * 광고 보상을 받은 뒤 이어서 실행할 재시도. 한도에 막힌 화면이 자기 것을 등록한다.
   *
   * 보상형 광고 모달은 앱 루트에 하나뿐이라(GlobalRewardedAdModal) 누가 막혔는지 모른다.
   * 이 슬롯이 없던 동안에는 광고를 끝까지 봐도 하던 일이 이어지지 않아, 사용자가 검색을
   * 처음부터 다시 눌러야 했다 — 보상을 받았는지조차 확신하기 어려웠다.
   *
   * ⚠️ 등록한 화면이 사라지면 반드시 거둬야 한다(언마운트 정리). 남아 있으면 없는 화면의
   * 상태를 건드린다. 남의 등록을 지우지 않도록 "내가 넣은 것일 때만" 비울 것.
   */
  retryAfterReward: (() => void) | null;
  setRetryAfterReward: (fn: (() => void) | null) => void;

  /**
   * 한도 초과를 **전역 모달 대신 화면 안에서** 안내하겠다고 등록한 핸들러.
   *
   * 🔴 iOS는 이미 떠 있는 RN Modal 위에 형제 Modal을 present하지 못한다. 그런데
   * 보상형 광고 모달(RewardedAdModal)·Pro 안내 모달은 앱 루트에 있어 언제나 형제다 —
   * AI 단어 생성처럼 **모달 안에서** 한도를 넘으면 그 present가 실패하고, RN은 실패를
   * 모른 채 "떠 있음"으로 기록해 두 번 다시 띄우지도 닫지도 않는다. 결과는 앱이
   * 강제 종료 전까지 터치를 받지 못하는 상태였다(2026-08-17 실기 확인, iOS 전용).
   *
   * 그래서 모달 안에서 도는 화면은 자기가 직접 안내하겠다고 여기에 등록한다. 등록이
   * 있으면 notifyQuotaExceeded는 전역 모달을 켜지 않고 이 핸들러만 부른다.
   *
   * ⚠️ retryAfterReward와 같은 규칙: 등록한 화면이 사라지면 반드시 거둔다. 남의 등록을
   * 지우지 않도록 "내가 넣은 것일 때만" 비울 것. 거두지 못해도 최악이 지금 동작(전역
   * 모달이 안 뜸)이라 먹통으로는 돌아가지 않는다.
   */
  inlineQuotaHandler: ((info: QuotaBlockInfo) => void) | null;
  setInlineQuotaHandler: (fn: ((info: QuotaBlockInfo) => void) | null) => void;

  refresh: (force?: boolean) => Promise<void>;
  set: (s: QuotaStatus) => void;
  /** enrich/generate/scan 성공 응답의 quota를 즉시 반영. RPC 없이 카운터 갱신. */
  applyEdgeQuota: (quota: Partial<QuotaStatus> | null | undefined) => void;
  clear: () => void;
  notifyQuotaExceeded: (status?: Partial<QuotaStatus> | null) => void;
  dismissQuotaExceeded: () => void;
  dismissProLimitReached: () => void;
}

const STALE_MS = 90 * 1000; // 90초

export const useQuotaStore = create<QuotaState>((set, get) => ({
  status: null,
  productId: null,
  loading: false,
  lastFetchedAt: 0,
  quotaExceededAt: 0,
  proLimitReachedAt: 0,
  retryAfterReward: null,
  inlineQuotaHandler: null,

  setRetryAfterReward: (fn) => set({ retryAfterReward: fn }),
  setInlineQuotaHandler: (fn) => set({ inlineQuotaHandler: fn }),

  refresh: async (force = false) => {
    if (!force && Date.now() - get().lastFetchedAt < STALE_MS) return;
    set({ loading: true });
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) {
        set({ status: null, productId: null, loading: false, lastFetchedAt: Date.now() });
        return;
      }
      // 익명 게스트도 authenticated role의 자체 quota RPC를 사용한다.
      // product_id는 결제 주기 표시용이라 실패해도 quota 갱신을 막지 않는다.
      const [quotaRes, subRes] = await Promise.all([
        supabase.rpc('get_ai_quota_status', { p_user_id: userData.user.id }),
        userData.user.is_anonymous ? Promise.resolve({ data: null }) : supabase
          .from('user_subscriptions')
          .select('play_product_id')
          .eq('user_id', userData.user.id)
          .maybeSingle(),
      ]);
      const productId = (subRes.data?.play_product_id as string | null | undefined) ?? null;
      if (!quotaRes.error && quotaRes.data) {
        set({ status: quotaRes.data as QuotaStatus, productId, loading: false, lastFetchedAt: Date.now() });
      } else {
        set({ productId, loading: false, lastFetchedAt: Date.now() });
      }
    } catch {
      set({ loading: false, lastFetchedAt: Date.now() });
    }
  },

  set: (s) => set({ status: s, lastFetchedAt: Date.now() }),
  applyEdgeQuota: (quota) => {
    if (!quota) return;
    const current = get().status;
    // Edge 응답 quota는 trial_ends_at/pro_until 미포함 → 기존 status 값 보존 머지.
    // (notifyQuotaExceeded와 동일 패턴.) 성공 호출이므로 lastFetchedAt도 갱신해
    // 직후 화면 진입 시 STALE 윈도 내 불필요한 refresh를 막는다.
    set({
      status: {
        trial_ends_at: current?.trial_ends_at ?? null,
        pro_until: current?.pro_until ?? null,
        ...quota,
      } as QuotaStatus,
      lastFetchedAt: Date.now(),
    });
  },
  clear: () => set({ status: null, productId: null, lastFetchedAt: 0, quotaExceededAt: 0, proLimitReachedAt: 0, retryAfterReward: null, inlineQuotaHandler: null }),
  notifyQuotaExceeded: (status) => {
    const current = get().status;
    const tier = status?.tier ?? current?.tier ?? 'free';
    const kind: QuotaBlockInfo['kind'] = tier === 'pro' ? 'pro' : 'ad';
    const handler = get().inlineQuotaHandler;
    // 화면이 직접 안내하겠다고 등록했으면 전역 모달은 켜지 않는다(위 슬롯 주석 참고).
    const next: Partial<QuotaState> = handler
      ? {}
      : kind === 'pro'
        ? { proLimitReachedAt: Date.now() }
        : { quotaExceededAt: Date.now() };
    if (status) {
      // Edge 응답 quota는 trial_ends_at/pro_until 미포함 → 기존 값과 머지
      next.status = {
        trial_ends_at: current?.trial_ends_at ?? null,
        pro_until: current?.pro_until ?? null,
        ...status,
      } as QuotaStatus;
      next.lastFetchedAt = Date.now();
    }
    set(next);
    // status를 반영한 뒤에 부른다 — 핸들러가 남은 한도를 곧바로 다시 읽는다.
    handler?.({ kind });
  },
  dismissQuotaExceeded: () => set({ quotaExceededAt: 0 }),
  dismissProLimitReached: () => set({ proLimitReachedAt: 0 }),
}));

export function useQuota() {
  const status = useQuotaStore((s) => s.status);
  const productId = useQuotaStore((s) => s.productId);
  const loading = useQuotaStore((s) => s.loading);
  const refresh = useQuotaStore((s) => s.refresh);
  return { status, productId, loading, refresh };
}

// ---- Pro tier disambiguation ----
//
// The server's get_ai_quota_status RPC returns tier='pro' for both paid
// subscribers (pro_until in the future) and trial users (trial_ends_at in
// the future). Same tier value, very different account states. The UI
// distinguishes them via these helpers so trial users see "체험 D-N" instead
// of identical paid-subscriber copy — which previously caused users to
// believe they had already paid.

export type ProMode = 'paid' | 'trial' | null;

/** Returns 'paid' for active subscription, 'trial' for active free trial, null otherwise. */
export function getProMode(status: QuotaStatus | null): ProMode {
  if (!status || status.tier !== 'pro') return null;
  const now = Date.now();
  if (status.pro_until && new Date(status.pro_until).getTime() > now) return 'paid';
  if (status.trial_ends_at && new Date(status.trial_ends_at).getTime() > now) return 'trial';
  return null;
}

/** Whole days remaining until trial expiry (ceil — partial day = 1). Null if no active trial. */
export function getTrialDaysLeft(status: QuotaStatus | null): number | null {
  if (!status?.trial_ends_at) return null;
  const ms = new Date(status.trial_ends_at).getTime() - Date.now();
  if (ms <= 0) return null;
  return Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}
