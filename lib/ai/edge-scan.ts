// Supabase Edge Function `scan-image` 호출 wrapper.
// 운영자 키 경로(non-BYOK + 로그인 사용자)로 이미지에서 단어를 추출한다.
// 추출 결과 검증(GeminiImageResultSchema)은 호출부(lib/gemini-api.ts)가 수행.

import { supabase } from '@/lib/supabase/client';
import { useQuotaStore } from '@/features/quota';
import type { QuotaInfo } from '@/lib/ai/edge-enrich';

export interface ScanEdgeOk {
  kind: 'ok';
  result: unknown[];
  quota: QuotaInfo;
}

export interface ScanEdgeErr {
  kind: 'unauthorized' | 'rate_limited' | 'quota_exceeded' | 'upstream' | 'invalid' | 'network';
  quota?: QuotaInfo;
  retryAfter?: number;
}

export type ScanEdgeResult = ScanEdgeOk | ScanEdgeErr;

export async function scanImageViaEdge(
  base64Image: string,
  sourceLang: string,
  signal?: AbortSignal,
): Promise<ScanEdgeResult> {
  try {
    const invokeOpts: Record<string, unknown> = {
      body: { image: base64Image, sourceLang },
    };
    if (signal) invokeOpts.signal = signal;
    const { data, error } = await supabase.functions.invoke<{
      result: unknown[];
      quota: QuotaInfo;
      error?: string;
      retry_after?: number;
    }>('scan-image', invokeOpts);

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
