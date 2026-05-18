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
  photo: 15,
};

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

  // service_role client: quota RPC + 환불용
  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

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
    const result = await analyzeWord(term, sourceLang, targetLang);
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
