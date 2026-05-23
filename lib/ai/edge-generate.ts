// Supabase Edge Function `generate-words` 호출 wrapper.
// 운영자 키 경로(non-BYOK + 로그인 사용자)로 주제→단어목록을 생성한다.
//
// 활성 조건:
//   1. EXPO_PUBLIC_ENRICH_VIA_EDGE=1 (호출부에서 분기)
//   2. 로그인 세션 존재 (supabase.auth.getSession)
//   3. 사용자 BYOK 키 없음 (호출부에서 분기)
//
// 결과 검증·매핑은 호출부(features/curation)가 AIWordResultSchema로 수행.

import { supabase } from '@/lib/supabase/client';
import { useQuotaStore } from '@/features/quota';
import type { QuotaInfo } from '@/lib/ai/edge-enrich';

export interface GenerateEdgeOk {
  kind: 'ok';
  result: unknown[];
  quota: QuotaInfo;
}

export interface GenerateEdgeErr {
  kind: 'unauthorized' | 'rate_limited' | 'quota_exceeded' | 'upstream' | 'invalid' | 'network';
  quota?: QuotaInfo;
  retryAfter?: number;
}

export type GenerateEdgeResult = GenerateEdgeOk | GenerateEdgeErr;

export async function generateWordsViaEdge(
  topic: string,
  wordCount: number,
  difficulty: string,
  sourceLang: string,
  targetLang: string,
  excludeTerms?: string[],
  signal?: AbortSignal,
): Promise<GenerateEdgeResult> {
  try {
    const invokeOpts: Record<string, unknown> = {
      body: { topic, wordCount, difficulty, sourceLang, targetLang, excludeTerms },
    };
    if (signal) invokeOpts.signal = signal;
    const { data, error } = await supabase.functions.invoke<{
      result: unknown[];
      quota: QuotaInfo;
      error?: string;
      retry_after?: number;
    }>('generate-words', invokeOpts);

    if (error) {
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
        useQuotaStore.getState().notifyQuotaExceeded(body?.quota as QuotaInfo | undefined);
        return { kind: 'quota_exceeded', quota: body?.quota };
      }
      if (status === 429 && code === 'rate_limited') {
        return { kind: 'rate_limited', retryAfter: body?.retry_after };
      }
      if (status === 400) return { kind: 'invalid' };
      return { kind: 'upstream' };
    }

    if (!data?.result || !data?.quota) return { kind: 'upstream' };
    // 성공 → 응답에 담긴 최신 quota를 store에 즉시 반영.
    useQuotaStore.getState().applyEdgeQuota(data.quota);
    return { kind: 'ok', result: data.result, quota: data.quota };
  } catch (e: any) {
    if (e?.name === 'AbortError') throw e;
    return { kind: 'network' };
  }
}
