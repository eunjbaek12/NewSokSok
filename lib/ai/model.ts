/**
 * BYOK(사용자가 자기 키를 넣는) 경로가 부르는 Gemini 모델.
 *
 * 세 곳 — 단어 자동완성(`lib/ai/gemini-client.ts`) · 사진 스캔(`lib/gemini-api.ts`) ·
 * AI 단어 생성(`features/curation/screen.tsx`) — 이 각자 모델명 문자열을 들고 있었다.
 * 흩어진 상수는 조용히 어긋난다. PHONETIC_INSTRUCTION 이 네 곳에 복제돼 있다가 한 곳만
 * 빈약해 ja>ko 후리가나의 48%를 깨뜨린 것과 같은 실패 양식이고, 이 모델명도 실제로
 * "앱 두 곳"으로 잘못 세고 있다가 세 번째(AI 단어 생성)를 놓칠 뻔했다.
 *
 * 서버(Vertex) 경로는 여기를 쓰지 않는다 — Deno 로 따로 번들돼 import 가 닿지 않고,
 * `supabase/functions/_shared/gemini-vertex.ts` 의 DEFAULT_MODEL(과 env `VERTEX_MODEL`)이
 * 정한다. 두 값이 갈라지는 것 자체는 정상일 수 있다(BYOK 비용은 사용자 몫, Vertex 는
 * 운영자 몫이라 교체 시점이 다를 수 있다). 다만 **모르는 새** 갈라지면 안 되므로
 * `__tests__/gemini-model-sync.test.ts` 가 양쪽을 대조한다.
 */
export const GEMINI_BYOK_MODEL = 'gemini-3.5-flash-lite';

/**
 * REST 로 직접 부르는 두 곳(사진 스캔 · AI 단어 생성)이 쓰는 엔드포인트.
 * 복제돼 있던 것은 모델명만이 아니라 API 버전(`v1beta`)도 마찬가지였다.
 */
export const byokGenerateContentUrl = (apiKey: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_BYOK_MODEL}:generateContent?key=${apiKey}`;
