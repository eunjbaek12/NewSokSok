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
import type { AIWordResult } from '@shared/contracts';

export type EnrichMode = 'autocomplete' | 'generate' | 'photo';

export interface QuotaInfo {
  tier: 'free' | 'pro';
  used: number;
  limit: number;
  bonus: number;
  reset_at: string;
}

export interface EnrichEdgeOk {
  kind: 'ok';
  result: AIWordResult;
  quota: QuotaInfo;
}

export interface EnrichEdgeErr {
  kind: 'unauthorized' | 'rate_limited' | 'quota_exceeded' | 'upstream' | 'invalid' | 'network';
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

      if (status === 401) return { kind: 'unauthorized' };
      if (status === 429 && code === 'quota_exceeded') {
        return { kind: 'quota_exceeded', quota: body?.quota };
      }
      if (status === 429 && code === 'rate_limited') {
        return { kind: 'rate_limited', retryAfter: body?.retry_after };
      }
      if (status === 400) return { kind: 'invalid' };
      return { kind: 'upstream' };
    }

    if (!data?.result || !data?.quota) return { kind: 'upstream' };
    return { kind: 'ok', result: data.result, quota: data.quota };
  } catch (e: any) {
    if (e?.name === 'AbortError') throw e;
    return { kind: 'network' };
  }
}
