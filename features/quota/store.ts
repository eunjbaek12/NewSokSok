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
  loading: boolean;
  lastFetchedAt: number;
  /** Edge가 quota_exceeded 응답을 돌려준 마지막 시각. RewardedAdModal trigger. */
  quotaExceededAt: number;

  refresh: (force?: boolean) => Promise<void>;
  set: (s: QuotaStatus) => void;
  clear: () => void;
  notifyQuotaExceeded: (status?: Partial<QuotaStatus> | null) => void;
  dismissQuotaExceeded: () => void;
}

const STALE_MS = 90 * 1000; // 90초

export const useQuotaStore = create<QuotaState>((set, get) => ({
  status: null,
  loading: false,
  lastFetchedAt: 0,
  quotaExceededAt: 0,

  refresh: async (force = false) => {
    if (!force && Date.now() - get().lastFetchedAt < STALE_MS) return;
    set({ loading: true });
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) {
        set({ status: null, loading: false, lastFetchedAt: Date.now() });
        return;
      }
      const { data, error } = await supabase.rpc('get_ai_quota_status', {
        p_user_id: userData.user.id,
      });
      if (!error && data) {
        set({ status: data as QuotaStatus, loading: false, lastFetchedAt: Date.now() });
      } else {
        set({ loading: false, lastFetchedAt: Date.now() });
      }
    } catch {
      set({ loading: false, lastFetchedAt: Date.now() });
    }
  },

  set: (s) => set({ status: s, lastFetchedAt: Date.now() }),
  clear: () => set({ status: null, lastFetchedAt: 0, quotaExceededAt: 0 }),
  notifyQuotaExceeded: (status) => {
    const next: Partial<QuotaState> = { quotaExceededAt: Date.now() };
    if (status) {
      const current = get().status;
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
}));

export function useQuota() {
  const status = useQuotaStore((s) => s.status);
  const loading = useQuotaStore((s) => s.loading);
  const refresh = useQuotaStore((s) => s.refresh);
  return { status, loading, refresh };
}
