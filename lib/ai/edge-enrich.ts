// Supabase Edge Function `enrich-word` 호출 wrapper.
// 운영자 키 경로(non-BYOK + 로그인 사용자) 전용.
//
// 활성 조건:
//   1. EXPO_PUBLIC_ENRICH_VIA_EDGE=1
//   2. 로그인 세션 존재 (supabase.auth.getSession)
//   3. 사용자 BYOK 키 없음 (호출부에서 분기)
//
// quota 정보는 응답으로 함께 받아 캐시.

import { supabase } from '@/lib/supabase/client';
import { useQuotaStore } from '@/features/quota';
import type { AIWordResult } from '@shared/contracts';
import { classifyEnrichHttpError } from './edge-enrich-error';

export type EnrichMode = 'autocomplete' | 'generate' | 'photo';

export interface QuotaInfo {
  tier: 'guest' | 'free' | 'pro';
  used: number;
  limit: number;
  bonus: number;
  reset_at: string;
  month_used: number;
  month_limit: number;
  reward_amount: number;
  reward_views: number;
  reward_max_views: number;
  ad_free_until: string | null;
}

export interface EnrichEdgeOk {
  kind: 'ok';
  result: AIWordResult;
  quota: QuotaInfo;
  enrichmentLevel: 'basic' | 'full';
}

export interface EnrichEdgeErr {
  kind: 'unauthorized' | 'rate_limited' | 'quota_exceeded' | 'not_found' | 'upstream' | 'invalid' | 'network';
  quota?: QuotaInfo;
  retryAfter?: number;
}

export type EnrichEdgeResult = EnrichEdgeOk | EnrichEdgeErr;

export async function enrichWordViaEdge(
  term: string,
  sourceLang: string,
  targetLang: string,
  mode: EnrichMode = 'autocomplete',
  signal?: AbortSignal,
): Promise<EnrichEdgeResult> {
  try {
    const invokeOpts: Record<string, unknown> = {
      body: { term, sourceLang, targetLang, mode },
    };
    if (signal) invokeOpts.signal = signal;
    const { data, error } = await supabase.functions.invoke<{
      result: AIWordResult;
      quota: QuotaInfo;
      error?: string;
      retry_after?: number;
      enrichment_level?: 'basic' | 'full';
    }>('enrich-word', invokeOpts);

    if (error) {
      // FunctionsHttpError(non-2xx) — body 안에 error 코드가 있음
      const ctx = (error as any).context;
      let body: any = null;
      try {
        if (ctx?.json) body = await ctx.json();
        else if (typeof ctx?.text === 'function') body = JSON.parse(await ctx.text());
      } catch { /* ignore */ }

      const code = body?.error as string | undefined;
      const status = ctx?.status as number | undefined;

      const kind = classifyEnrichHttpError(status, code);
      if (kind === 'unauthorized') return { kind };
      if (kind === 'not_found') return { kind, quota: body?.quota };
      if (kind === 'quota_exceeded') {
        // 전역 store 신호 → RewardedAdModal trigger
        useQuotaStore.getState().notifyQuotaExceeded(body?.quota as QuotaInfo | undefined);
        return { kind: 'quota_exceeded', quota: body?.quota };
      }
      if (kind === 'rate_limited') {
        return { kind: 'rate_limited', retryAfter: body?.retry_after };
      }
      if (kind === 'invalid') return { kind };
      return { kind };
    }

    if (!data?.result || !data?.quota) return { kind: 'upstream' };
    // 성공(차감 완료 or 캐시히트) → 응답에 담긴 최신 quota를 store에 즉시 반영.
    useQuotaStore.getState().applyEdgeQuota(data.quota);
    return { kind: 'ok', result: data.result, quota: data.quota, enrichmentLevel: data.enrichment_level ?? 'full' };
  } catch (e: any) {
    if (e?.name === 'AbortError') throw e;
    return { kind: 'network' };
  }
}
