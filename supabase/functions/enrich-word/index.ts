// POST /functions/v1/enrich-word
// Body: { term: string, sourceLang: string, targetLang: string, mode?: 'autocomplete'|'generate'|'photo' }
// Headers: Authorization: Bearer <supabase JWT>
//
// 흐름: JWT 검증 → rate-limit → consume_ai_quota RPC → Vertex AI 호출
//      → 실패 시 quota 환불(refund_ai_quota) → 결과 반환
//
// 응답:
//   200 { result: {...}, quota: { tier, used, limit, bonus, reset_at } }
//   400 { error: 'invalid_request' }
//   401 { error: 'unauthorized' }
//   429 { error: 'rate_limited' | 'quota_exceeded', quota?, retry_after? }
//   500 { error: 'upstream_failure' | 'internal_error' }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import { analyzeWord } from '../_shared/gemini-vertex.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const COST_BY_MODE: Record<string, number> = {
  autocomplete: 1,
  generate: 20,
  // 사진: 추출 오버헤드는 scan-image가 장당 5로 별도 차감하고, 추출된 단어의 보강은
  // 단어당 1(자동완성과 동일). 캐시 히트는 무차감.
  photo: 1,
};

// 공용 enrich 캐시 스키마/프롬프트 버전. _shared/gemini-vertex.ts의 프롬프트나
// AIWordResult 필드 구조가 바뀌면 bump → 옛 캐시는 미스 처리되어 재생성·덮어쓰기됨.
const PROMPT_VERSION = 1;

const ALLOWED_LANGS = new Set(['en', 'ko', 'ja', 'zh']);

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json(401, { error: 'unauthorized' });
  }

  // 사용자 식별: anon client + Authorization 헤더로 auth.getUser()
  const authClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await authClient.auth.getUser();
  if (userErr || !userData?.user) {
    return json(401, { error: 'unauthorized' });
  }
  const userId = userData.user.id;

  // Body
  let body: { term?: string; sourceLang?: string; targetLang?: string; mode?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid_request', detail: 'malformed json' });
  }

  const term = (body.term ?? '').trim();
  // 캐시 키·Vertex 입력 정규화. 클라이언트 로컬 캐시(lib/enrich-cache.ts)와 동일 규칙
  // (소문자) → "Apple"/"apple"이 같은 공용 캐시 항목을 공유.
  const termKey = term.toLowerCase();
  const sourceLang = (body.sourceLang ?? '').toLowerCase();
  const targetLang = (body.targetLang ?? '').toLowerCase();
  const mode = (body.mode ?? 'autocomplete').toLowerCase();

  if (!term || term.length > 100) return json(400, { error: 'invalid_request', detail: 'term' });
  if (!ALLOWED_LANGS.has(sourceLang)) return json(400, { error: 'invalid_request', detail: 'sourceLang' });
  if (!ALLOWED_LANGS.has(targetLang)) return json(400, { error: 'invalid_request', detail: 'targetLang' });
  const cost = COST_BY_MODE[mode];
  if (!cost) return json(400, { error: 'invalid_request', detail: 'mode' });

  // Rate limit (per-isolate, best-effort)
  const rl = checkRateLimit(userId);
  if (!rl.ok) {
    return json(429, { error: 'rate_limited', retry_after: rl.retryAfter });
  }

  // service_role client: 캐시 + quota RPC + 환불용
  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // 공용 캐시 조회 — 히트면 Vertex를 안 부르므로 quota를 차감하지 않는다.
  // (quota는 Vertex 호출 비용 상한이 목적 → 비용 0인 캐시 히트는 무차감)
  try {
    const { data: cached } = await svc
      .from('enrich_cache')
      .select('result')
      .eq('source_lang', sourceLang)
      .eq('target_lang', targetLang)
      .eq('term', termKey)
      .eq('prompt_version', PROMPT_VERSION)
      .maybeSingle();
    if (cached?.result) {
      const { data: quotaStatus } = await svc.rpc('get_ai_quota_status', { p_user_id: userId });
      // hit_count 증가는 응답을 막지 않도록 fire-and-forget
      svc.rpc('increment_enrich_cache_hit', {
        p_source_lang: sourceLang, p_target_lang: targetLang, p_term: termKey,
      }).then(() => {}, () => {});
      return json(200, { result: cached.result, quota: quotaStatus, cached: true });
    }
  } catch (e) {
    // 캐시 조회 실패는 치명적이지 않음 — 정상 경로(quota → Vertex)로 계속
    console.error('enrich_cache lookup failed', e);
  }

  // quota 차감 시도
  const { data: quotaData, error: quotaErr } =
    await svc.rpc('consume_ai_quota', { p_user_id: userId, p_cost: cost });
  if (quotaErr) {
    console.error('consume_ai_quota error', quotaErr);
    return json(500, { error: 'internal_error' });
  }
  const quota = quotaData as {
    allowed: boolean; tier: string; used: number; limit: number;
    bonus: number; reset_at: string;
  };
  if (!quota.allowed) {
    return json(429, { error: 'quota_exceeded', quota });
  }

  // Vertex AI 호출
  try {
    const result = await analyzeWord(termKey, sourceLang, targetLang);
    // 공용 캐시에 기록 — 다음 사용자부터 즉시. 캐시 쓰기 실패가 응답을 깨지 않게 격리.
    try {
      await svc.from('enrich_cache').upsert({
        source_lang: sourceLang,
        target_lang: targetLang,
        term: termKey,
        result,
        prompt_version: PROMPT_VERSION,
        updated_at: new Date().toISOString(),
      });
    } catch (cacheErr) {
      console.error('enrich_cache write failed', cacheErr);
    }
    return json(200, { result, quota });
  } catch (e) {
    console.error('vertex call failed', e);
    // 차감 환불 — 사용자 잘못 아닌 실패는 한도 소모하지 않도록
    const { error: refundErr } = await svc.rpc('refund_ai_quota', {
      p_user_id: userId, p_cost: cost,
    });
    if (refundErr) console.error('quota refund failed', refundErr);
    return json(500, { error: 'upstream_failure' });
  }
});
