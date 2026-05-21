// POST /functions/v1/scan-image
// Body: { image: string (base64 JPEG), sourceLang: string }
// Headers: Authorization: Bearer <supabase JWT>
//
// 흐름: JWT 검증 → rate-limit → consume_ai_quota(cost=5, 추출 오버헤드 고정)
//      → Vertex 비전 추출 → 실패 시 환불 → 결과 반환
//
// quota: 추출은 이미지 1장당 비전 호출 1회라 "장당 고정 5". 추출된 단어의 의미·예문
//        보강은 클라이언트가 enrich-word(단어당 1)로 별도 처리 → 추출≠보강 분리 과금.
//
// 응답:
//   200 { result: [{word}], quota }
//   400/401/429/500 { error }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import { extractWordsFromImage } from '../_shared/gemini-vertex.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const ALLOWED_LANGS = new Set(['en', 'ko', 'ja', 'zh']);
const EXTRACT_COST = 5;
// base64 길이 상한 (대략 7MB 원본 이미지 ≈ 9.4MB base64). 과대 페이로드 차단.
const MAX_IMAGE_CHARS = 10_000_000;

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

  const authClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await authClient.auth.getUser();
  if (userErr || !userData?.user) {
    return json(401, { error: 'unauthorized' });
  }
  const userId = userData.user.id;

  let body: { image?: string; sourceLang?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid_request', detail: 'malformed json' });
  }

  const image = (body.image ?? '').trim();
  const sourceLang = (body.sourceLang ?? '').toLowerCase();

  if (!image || image.length > MAX_IMAGE_CHARS) return json(400, { error: 'invalid_request', detail: 'image' });
  if (!ALLOWED_LANGS.has(sourceLang)) return json(400, { error: 'invalid_request', detail: 'sourceLang' });

  const rl = checkRateLimit(userId);
  if (!rl.ok) {
    return json(429, { error: 'rate_limited', retry_after: rl.retryAfter });
  }

  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // 추출 오버헤드 고정 차감 (장당 5)
  const { data: quotaData, error: quotaErr } =
    await svc.rpc('consume_ai_quota', { p_user_id: userId, p_cost: EXTRACT_COST });
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

  try {
    const result = await extractWordsFromImage(image, sourceLang);
    return json(200, { result, quota });
  } catch (e) {
    console.error('vertex image extract failed', e);
    const { error: refundErr } = await svc.rpc('refund_ai_quota', {
      p_user_id: userId, p_cost: EXTRACT_COST,
    });
    if (refundErr) console.error('quota refund failed', refundErr);
    return json(500, { error: 'upstream_failure' });
  }
});
