// POST /functions/v1/seed-enrich
// 캐시 시딩 전용 — 운영자 배치 작업이라 사용자 경로(enrich-word)와 분리했다.
//
// enrich-word 와 다른 점:
//   - service_role 키로만 열린다. 일반 사용자 JWT 로는 못 연다.
//   - quota 차감 없음 · rate limit 없음 — 사용자 요청이 아니라 운영 작업이다.
//     (사용자용 분당 40회 cap 으로는 5만 건에 22시간이 걸리고 한도에 먼저 막힌다.)
//   - 🔑 캐시를 읽지도 쓰지도 않는다. 생성 결과를 그대로 돌려주기만 한다.
//     저장은 호출자(로컬 시딩 스크립트)가 품질 검사를 통과시킨 뒤에 한다 —
//     서버가 곧바로 쓰면 검사할 틈이 없어, 표제어가 빠진 예문이 그대로 굳는다.
//
// Body: { items: [{ term, sourceLang, targetLang }, ...] }   (최대 20건)
// 응답: 200 { results: [{ term, sourceLang, targetLang, ok, result?, error? }] }
//       400 { error: 'invalid_request' }
//       401 { error: 'unauthorized' }

import { analyzeWord } from '../_shared/gemini-vertex.ts';

const ALLOWED_LANGS = new Set(['en', 'ko', 'ja', 'zh', 'vi', 'es']);
// 한 요청 안에서 병렬로 도는 수. Edge 의 wall-clock 예산 안에 들도록 보수적으로 잡는다
// (analyzeWord 1건이 2~5초, 20건 병렬이면 최악 10초 안팎).
const MAX_ITEMS = 20;

interface Item { term: string; sourceLang: string; targetLang: string }

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  // service_role 권한만 연다. 토큰 값을 문자열로 맞추지 않고 role 클레임을 보는 이유는,
  // 이 프로젝트에 구형 JWT 키와 신형 sb_secret 키가 함께 있어 Deno.env 에 주입된 값과
  // 호출자가 보낸 값의 형식이 어긋날 수 있기 때문이다(실제로 그래서 401이 났다).
  // 서명 검증은 Edge 게이트웨이가 함수보다 먼저 끝내므로 여기서는 role 만 확인하면 된다
  // — anon 은 role=anon, 사용자 세션은 role=authenticated 라 그대로 걸러진다.
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  let role = '';
  try {
    role = JSON.parse(atob(token.split('.')[1])).role ?? '';
  } catch { /* JWT 형식이 아니면 role 은 빈 문자열로 두고 아래에서 거부 */ }
  if (role !== 'service_role') return json(401, { error: 'unauthorized' });

  let body: { items?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid_request', detail: 'malformed json' });
  }

  const raw = body.items;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_ITEMS) {
    return json(400, { error: 'invalid_request', detail: `items must be 1..${MAX_ITEMS}` });
  }

  const items: Item[] = [];
  for (const r of raw) {
    const term = String((r as Item)?.term ?? '').trim().toLowerCase();
    const sourceLang = String((r as Item)?.sourceLang ?? '').toLowerCase();
    const targetLang = String((r as Item)?.targetLang ?? '').toLowerCase();
    if (!term || term.length > 100) return json(400, { error: 'invalid_request', detail: 'term' });
    if (!ALLOWED_LANGS.has(sourceLang)) return json(400, { error: 'invalid_request', detail: 'sourceLang' });
    if (!ALLOWED_LANGS.has(targetLang)) return json(400, { error: 'invalid_request', detail: 'targetLang' });
    items.push({ term, sourceLang, targetLang });
  }

  const results = await Promise.all(items.map(async (it) => {
    try {
      const result = await analyzeWord(it.term, it.sourceLang, it.targetLang);
      return { ...it, ok: true, result };
    } catch (e) {
      console.error('seed analyzeWord failed', it.term, it.sourceLang, it.targetLang, e);
      return { ...it, ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }));

  return json(200, { results });
});
