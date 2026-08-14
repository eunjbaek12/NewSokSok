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
import { translateMeaningOnly } from '../_shared/gemini-meaning.ts';
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
// v2: isReal 판정 추가 — 옛 캐시는 가짜 단어에 그럴듯한 정의를 담고 있을 수 있어 재생성.
// v3: 동음이의어 대표 뜻 ①② 병기 지시 — 옛 캐시는 단일 뜻만 담고 있어 재생성.
// v4: 동음이의어 senses 배열 추가(인라인 뜻 제안 UI용) — v3 캐시엔 배열이 없어 재생성.
// v5: 베트남어 발음 성조 막대(˧˧, ㅓㅓ처럼 렌더링) 제거 지시 — v4 캐시는 막대 포함이라 재생성.
// v6: 같은 언어쌍 규칙(뜻=쉬운 뜻풀이·예문 번역=빈 문자열 — ko→ko senses 예문 번역이
//     영어로 이탈하던 실측 수정) + 뜻 목록(개수·순서)은 출발어 속성으로 고정 + 언어 가드
//     교정("출발어·도착어만 사용") — v5 캐시는 같은 언어쌍 오염·뜻 개수 편차 가능성으로 재생성.
//     ⚠️ 클라이언트 lib/enrich-cache-shared.ts SHARED_ENRICH_PROMPT_VERSION과 함께 bump.
// v7: (1) 니모닉 제거 — 생성·저장만 되고 화면에 닿는 경로가 없던 죽은 필드라 출력 토큰만
//     먹고 있었다. (2) 예문은 표제어를 그대로 또는 활용형으로 반드시 포함하도록 지시 —
//     유의어로 바꿔 쓴 예문은 빈칸을 팔 자리가 없어 예문 학습에서 조용히 빠졌다
//     (docs/backlog-examples-enrich.md P6). v6 캐시는 니모닉을 담고 있고 표제어 미포함
//     예문이 섞여 있어 재생성.
// v8: 2026-08-14 되돌림 — 7로 복귀.
//     뜻 전용(basic) 경로가 "tooli"를 "tool"로 암묵 교정해 "도구"로 저장한 문제를 고치며
//     bump했는데, 그 수정은 _shared/gemini-meaning.ts(basic 전용)에 있고 full enrich
//     프롬프트(_shared/gemini-vertex.ts)는 한 글자도 바뀌지 않았다. 그래서 v7 캐시
//     80,714행(생성비 ₩37,412)이 이유 없이 통째로 미스 처리되고 있었다.
//     이미 굳어 있던 오답은 그 1행(en>ko "tooli", basic, hit 0)을 DELETE해서 처리했다.
//     basic 프롬프트 강화는 버전 숫자와 무관하게 그대로 작동한다.
// 🔑 캐시를 버려야 하는 변경은 _shared/gemini-vertex.ts의 프롬프트나 AIWordResult 구조가
//    바뀔 때뿐이다. 저장된 오답 몇 건을 없애려는 것이라면 bump가 아니라 그 행을 지울 것 —
//    bump는 8만 행을 함께 버리고, 스토어에 나가 있는 앱(이 상수의 값으로 조회)과도 어긋난다.
const PROMPT_VERSION = 7;

const ALLOWED_LANGS = new Set(['en', 'ko', 'ja', 'zh', 'vi', 'es']);

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

  // Entitlement is consumed before cache lookup. A cached full result is still
  // a paid product lookup, even though it has no marginal Vertex cost.
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
  const { data: cached } = await svc.from('enrich_cache').select('result,enrichment_level')
    .eq('source_lang', sourceLang).eq('target_lang', targetLang).eq('term', termKey)
    .eq('prompt_version', PROMPT_VERSION).maybeSingle();
  if (!quota.allowed) {
    try {
      const basic = cached?.result?.meaningKr
        ? { term: termKey, definition: '', exampleEn: '', exampleKr: '', meaningKr: cached.result.meaningKr, pos: '', phonetic: '', isReal: cached.result.isReal }
        : await translateMeaningOnly(termKey, sourceLang, targetLang);
      if (!basic.meaningKr || basic.isReal === false) return json(404, { error: 'not_found', quota });
      if (!cached?.result) await svc.from('enrich_cache').upsert({ source_lang: sourceLang, target_lang: targetLang, term: termKey, result: basic, enrichment_level: 'basic', prompt_version: PROMPT_VERSION, updated_at: new Date().toISOString() });
      return json(200, { result: basic, quota, cached: !!cached?.result, enrichment_level: 'basic' });
    } catch (e) {
      console.error('basic meaning failed', e);
      return json(500, { error: 'upstream_failure', quota });
    }
  }
  if (cached?.result && cached.enrichment_level === 'full') {
    svc.rpc('increment_enrich_cache_hit', { p_source_lang: sourceLang, p_target_lang: targetLang, p_term: termKey }).then(() => {}, () => {});
    return json(200, { result: cached.result, quota, cached: true, enrichment_level: 'full' });
  }

  // Vertex AI 호출
  try {
    const result = await analyzeWord(termKey, sourceLang, targetLang);
    if (result?.isReal === false || !result?.meaningKr) {
      await svc.rpc('refund_ai_quota', { p_user_id: userId, p_cost: cost });
      return json(404, { error: 'not_found', quota });
    }
    // 공용 캐시에 기록 — 다음 사용자부터 즉시. 캐시 쓰기 실패가 응답을 깨지 않게 격리.
    //
    // 단, "실재하지 않는 단어"(isReal=false) 판정은 캐시하지 않는다 — 클라이언트
    // (lib/translation-api.ts:114)와 같은 규칙. 빈 결과가 공용 캐시에 굳으면 모델이 진짜
    // 단어를 한 번 오판했을 때 그 단어는 모든 사용자에게 영구히 "없는 단어"가 된다
    // (PROMPT_VERSION을 올려 캐시를 통째로 버리기 전까지). 오타 재조회 비용보다 이쪽이 크다.
    if (result?.isReal !== false) {
      // upsert 실패는 throw가 아니라 { error }로 온다 — catch로는 안 잡히므로 직접 확인.
      const { error: cacheErr } = await svc.from('enrich_cache').upsert({
        source_lang: sourceLang,
        target_lang: targetLang,
        term: termKey,
        result,
        enrichment_level: 'full',
        prompt_version: PROMPT_VERSION,
        updated_at: new Date().toISOString(),
      });
      if (cacheErr) console.error('enrich_cache write failed', cacheErr);
    }
    return json(200, { result, quota, enrichment_level: 'full' });
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
