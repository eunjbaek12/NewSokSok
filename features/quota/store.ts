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
  tier: 'free' | 'pro';
  used: number;
  limit: number;
  bonus: number;
  trial_ends_at: string | null;
  pro_until: string | null;
  reset_at: string;
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

  refresh: async (force = false) => {
    if (!force && Date.now() - get().lastFetchedAt < STALE_MS) return;
    set({ loading: true });
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) {
        set({ status: null, productId: null, loading: false, lastFetchedAt: Date.now() });
        return;
      }
      // quota 상태(RPC)와 구독 상품 ID(테이블 직접 조회, RLS self_read 허용)를 병렬로.
      // product_id는 결제 주기 표시용이라 실패해도 quota 갱신을 막지 않는다.
      const [quotaRes, subRes] = await Promise.all([
        supabase.rpc('get_ai_quota_status', { p_user_id: userData.user.id }),
        supabase
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
  clear: () => set({ status: null, productId: null, lastFetchedAt: 0, quotaExceededAt: 0, proLimitReachedAt: 0 }),
  notifyQuotaExceeded: (status) => {
    const current = get().status;
    // tier 우선순위: Edge 응답 quota > 기존 status > 'free' (게스트는 여기 도달 X)
    const tier = (status?.tier ?? current?.tier ?? 'free') as 'free' | 'pro';
    const next: Partial<QuotaState> =
      tier === 'pro' ? { proLimitReachedAt: Date.now() } : { quotaExceededAt: Date.now() };
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
