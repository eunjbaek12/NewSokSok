// POST /functions/v1/scan-image
// Body: { image: string (base64 JPEG), sourceLang: string }
// Headers: Authorization: Bearer <supabase JWT>
//
// 흐름: JWT 검증 → rate-limit → get_ai_quota_status(잔량 확인만, 차감 0)
//      → Vertex 비전 추출 → 결과 반환
//
// quota: **추출은 차감하지 않는다.** 사용자에게 알린 규칙은 "AI 가 채워준 단어 수만큼"
//        한 문장뿐이고, 장당 오버헤드는 사용자가 셀 수 없는 데다 게스트 한도 10 에서는
//        절반을 먹는다. 게다가 클라이언트(PhotoImportWorkflow)가 `limit + bonus - used`
//        로 페이지를 자르므로, 서버가 몰래 더 떼면 계산이 어긋나 뒷장이 조용히 실패한다.
//        추출된 단어의 보강만 enrich-word(단어당 1)가 차감한다.
//
// 🔴 차감이 0 이어도 **잔량 확인은 남긴다.** 빼면 한도를 다 쓴 사용자가 vision 호출을
//    무한히 부를 수 있다 — rate-limit 은 분당 제한이라 하루 총량을 막지 못한다.
//
// 응답:
//   200 { result: [{word}], quota }
//   400/401/429/500 { error }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import { extractWordsFromImage } from '../_shared/gemini-vertex.ts';
import { matchesSourceScript, isLikelyPhrase } from '../_shared/script-filter.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const ALLOWED_LANGS = new Set(['en', 'ko', 'ja', 'zh', 'vi', 'es']);
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

  // 잔량 확인만 — 차감은 0. (헤더 주석 참조)
  const { data: quotaData, error: quotaErr } =
    await svc.rpc('get_ai_quota_status', { p_user_id: userId });
  if (quotaErr) {
    console.error('get_ai_quota_status error', quotaErr);
    return json(500, { error: 'internal_error' });
  }
  const quota = quotaData as {
    tier: string; used: number; limit: number; bonus: number; reset_at: string;
    month_used?: number; month_limit?: number;
  };
  // Pro 는 월 한도가 진짜 상한이고 일일 한도는 그것과 같은 값이라 사실상 무제한이다.
  // 둘 다 봐야 월 3,000 을 소진한 Pro 가 스캔을 계속 부르는 것을 막는다.
  const dailyLeft = (quota.limit ?? 0) + (quota.bonus ?? 0) - (quota.used ?? 0);
  const monthLeft = quota.tier === 'pro'
    ? (quota.month_limit ?? 0) - (quota.month_used ?? 0)
    : Number.POSITIVE_INFINITY;
  if (dailyLeft <= 0 || monthLeft <= 0) {
    return json(429, { error: 'quota_exceeded', quota });
  }

  try {
    const extracted = await extractWordsFromImage(image, sourceLang);
    // 프롬프트가 출발어 단어만 요청해도 모델이 (1) 사진 속 다른 언어 텍스트나
    // (2) "하는중입니다" 같은 문장 덩어리를 뽑는 사례가 있어, 문자 체계가 다르거나
    // 문장/구로 보이는 토큰은 반환 전에 제거한다.
    const result = extracted.filter((e) => {
      const word = (e as { word?: unknown })?.word;
      return typeof word === 'string'
        && matchesSourceScript(word, sourceLang)
        && !isLikelyPhrase(word, sourceLang);
    });
    return json(200, { result, quota });
  } catch (e) {
    // 환불할 것이 없다 — 위에서 차감하지 않았다.
    console.error('vertex image extract failed', e);
    return json(500, { error: 'upstream_failure' });
  }
});
