import { supabase } from '@/lib/supabase/client';
import { normalizeSenses } from '@/lib/senses';
import type { AutoFillResult } from './types';

// 전 사용자 공용 enrich 캐시(Supabase enrich_cache)의 클라이언트 읽기.
// BYOK 사용자는 Edge Function을 거치지 않으므로, 본인 키 호출 전에 이 캐시를 직접
// 조회해 다른 사용자가 이미 만든 결과를 즉시 받는다.
//
// 쓰기는 service_role(Edge Function) 전용이라 여기선 읽기만 한다. RLS상 SELECT는
// authenticated 전용 → 로그인 세션이 없으면 곧장 null(미스)로 처리해 헛 네트워크 호출을 막는다.
//
// SHARED_ENRICH_PROMPT_VERSION은 Edge Function의 PROMPT_VERSION과 반드시 동일해야 한다
// (supabase/functions/enrich-word/index.ts). 한쪽만 bump하면 영영 미스가 난다.
export const SHARED_ENRICH_PROMPT_VERSION = 4;

export async function fetchSharedEnrich(
  term: string,
  sourceLang: string,
  targetLang: string,
): Promise<AutoFillResult | null> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return null;

    const termKey = term.trim().toLowerCase();
    if (!termKey) return null;

    const { data, error } = await supabase
      .from('enrich_cache')
      .select('result')
      .eq('source_lang', sourceLang)
      .eq('target_lang', targetLang)
      .eq('term', termKey)
      .eq('prompt_version', SHARED_ENRICH_PROMPT_VERSION)
      .maybeSingle();

    if (error || !data?.result) return null;

    const r = data.result as Record<string, unknown>;
    const senses = normalizeSenses(r.senses);
    return {
      definition: (r.definition as string) || '',
      meaningKr: (r.meaningKr as string) || '',
      exampleEn: (r.exampleEn as string) || '',
      exampleKr: (r.exampleKr as string) || '',
      mnemonic: (r.mnemonic as string) || '',
      pos: (r.pos as string) || '',
      phonetic: (r.phonetic as string) || '',
      ...(senses ? { senses } : {}),
    };
  } catch {
    return null;
  }
}
