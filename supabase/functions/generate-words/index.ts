// POST /functions/v1/generate-words
// Body: { topic: string, wordCount: number, difficulty: string,
//         sourceLang: string, targetLang: string, excludeTerms?: string[] }
// Headers: Authorization: Bearer <supabase JWT>
//
// 흐름: JWT 검증 → rate-limit → consume_ai_quota(cost=wordCount) → Vertex 생성
//      → 실패 시 quota 환불(refund_ai_quota) → 결과 반환
//
// quota 차감: "생성 개수만큼" — p_cost = wordCount (enrich-word의 단어당 가중치와 동일 단위).
// 캐시 없음: 생성은 매번 새 결과(재생성은 excludeTerms 사용)라 공용 캐시 부적합.
//
// 응답:
//   200 { result: AIWordResult[], quota: { tier, used, limit, bonus, reset_at } }
//   400 { error: 'invalid_request' }
//   401 { error: 'unauthorized' }
//   429 { error: 'rate_limited' | 'quota_exceeded', quota?, retry_after? }
//   500 { error: 'upstream_failure' | 'internal_error' }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import { generateWords } from '../_shared/gemini-vertex.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const ALLOWED_LANGS = new Set(['en', 'ko', 'ja', 'zh', 'vi', 'es']);
const ALLOWED_DIFFICULTY = new Set(['beginner', 'intermediate', 'advanced']);
const MAX_WORD_COUNT = 50;
const MAX_EXCLUDE = 200;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  // 콜드 스타트 진단용 구간 타이밍. reqStart는 핸들러 진입(=콜드면 isolate 부팅 직후) 시각.
  const reqStart = performance.now();

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
  const tAuth = performance.now();

  let body: {
    topic?: string; wordCount?: number; difficulty?: string;
    sourceLang?: string; targetLang?: string; excludeTerms?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid_request', detail: 'malformed json' });
  }

  const topic = (body.topic ?? '').trim();
  const sourceLang = (body.sourceLang ?? '').toLowerCase();
  const targetLang = (body.targetLang ?? '').toLowerCase();
  const difficulty = (body.difficulty ?? 'intermediate').toLowerCase();
  const wordCount = Math.floor(Number(body.wordCount));
  const excludeTerms = Array.isArray(body.excludeTerms)
    ? body.excludeTerms.filter((x): x is string => typeof x === 'string').slice(0, MAX_EXCLUDE)
    : undefined;

  if (!topic || topic.length > 100) return json(400, { error: 'invalid_request', detail: 'topic' });
  if (!ALLOWED_LANGS.has(sourceLang)) return json(400, { error: 'invalid_request', detail: 'sourceLang' });
  if (!ALLOWED_LANGS.has(targetLang)) return json(400, { error: 'invalid_request', detail: 'targetLang' });
  if (!ALLOWED_DIFFICULTY.has(difficulty)) return json(400, { error: 'invalid_request', detail: 'difficulty' });
  if (!Number.isFinite(wordCount) || wordCount < 1 || wordCount > MAX_WORD_COUNT) {
    return json(400, { error: 'invalid_request', detail: 'wordCount' });
  }

  // Rate limit (per-isolate, best-effort)
  const rl = checkRateLimit(userId);
  if (!rl.ok) {
    return json(429, { error: 'rate_limited', retry_after: rl.retryAfter });
  }

  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // quota 차감 시도 — 생성 개수만큼(wordCount)
  const { data: quotaData, error: quotaErr } =
    await svc.rpc('consume_ai_quota', { p_user_id: userId, p_cost: wordCount });
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
  const tQuota = performance.now();

  // Vertex AI 생성
  // 오버제너레이트: 모델이 같은 단어를 중복 생성해도 요청 개수를 채우도록 버퍼만큼 더 생성.
  // quota 차감은 위에서 요청 개수(wordCount)만 했고, 버퍼는 운영자가 흡수(비과금).
  // 중복 제거·정확히 N개 자르기는 클라이언트가 검증(AIWordResultSchema) 후 수행한다.
  const overCount = wordCount + Math.min(6, Math.max(3, Math.ceil(wordCount * 0.2)));
  try {
    const result = await generateWords(topic, overCount, difficulty, sourceLang, targetLang, excludeTerms);
    const tGen = performance.now();
    console.log(
      `[generate-words:timing] auth=${(tAuth - reqStart).toFixed(0)}ms ` +
      `quota=${(tQuota - tAuth).toFixed(0)}ms generate=${(tGen - tQuota).toFixed(0)}ms ` +
      `total=${(tGen - reqStart).toFixed(0)}ms wordCount=${wordCount} overCount=${overCount}`,
    );
    return json(200, { result, quota });
  } catch (e) {
    console.error(
      `[generate-words:timing] FAILED auth=${(tAuth - reqStart).toFixed(0)}ms ` +
      `quota=${(tQuota - tAuth).toFixed(0)}ms generate=${(performance.now() - tQuota).toFixed(0)}ms ` +
      `total=${(performance.now() - reqStart).toFixed(0)}ms`,
    );
    console.error('vertex generate failed', e);
    // 차감 환불 — 사용자 잘못 아닌 실패는 한도 소모하지 않도록
    const { error: refundErr } = await svc.rpc('refund_ai_quota', {
      p_user_id: userId, p_cost: wordCount,
    });
    if (refundErr) console.error('quota refund failed', refundErr);
    return json(500, { error: 'upstream_failure' });
  }
});
