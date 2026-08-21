/**
 * scripts/ 가 부르는 Gemini 모델 — 선언 자리는 여기 한 곳이다.
 *
 * 왜 모았나: 2026-08-19, `gemini-2.5` 계열이 신규 GCP 프로젝트에서 404 가 되면서
 * (`This model is no longer available to new users`) 스크립트 36개가 한꺼번에 죽었다.
 * 각자 모델명 문자열을 들고 있었기 때문이다. 앱은 같은 실패를 먼저 겪고
 * `lib/ai/model.ts` 로 모았는데, 그때 만든 `__tests__/gemini-model-sync.test.ts` 는
 * "scripts/ 는 운영자 도구라 사용자에게 안 닿는다"며 scripts/ 를 범위에서 일부러 뺐다.
 * **안 닿는 것과 안 죽는 것은 다르다.** 이제 그 테스트가 여기도 본다.
 *
 * 🔴 모델을 바꾼 뒤 덱 생성을 그냥 돌리지 말 것 — 예문 길이가 갈린다.
 *    번역 스크립트의 프롬프트는 예문을 "N-M words" 로 지시하지만 **그 숫자는 지금껏
 *    지켜진 적이 없다.** 길이를 실제로 정한 것은 모델의 성향이었고, 기존 덱과 새 카드가
 *    맞았던 것은 둘 다 같은 모델(2.5-flash)로 만들었기 때문이다. 3.5-flash-lite 는
 *    스펙을 실제로 따르므로, 바꾸는 순간 같은 덱 안에서 길이가 갈린다 — ko-ladder 의
 *    inter2 가 7.1 → 9.4어절로 튀었다(레거시는 7.3).
 *    **모델 교체 후 첫 배치는 반드시 기존 덱과 예문 길이를 대조하라.**
 *    측정법과 보정 요령은 `translate-ko-ladder-vocab.ts` 의 LEVEL_SPEC 주석에 있다.
 *
 * 🔑 서버(Vertex) 경로는 여기를 쓰지 않는다 — `supabase/functions/_shared/gemini-vertex.ts`
 *    가 따로 정한다. BYOK(앱)는 `lib/ai/model.ts`. 셋이 갈리는 것 자체는 정상이다
 *    (지갑과 교체 시점이 다르다). 다만 **모르는 새** 갈리면 안 된다.
 */
export const SCRIPT_GEMINI_MODEL = 'gemini-3.5-flash-lite';

/**
 * `--model=` 인자를 푼다.
 *
 * `lite` 는 무료 티어에서 "별도 RPD 버킷"을 쓰려던 별칭이었다(모델당 하루 20요청이라
 * flash 와 flash-lite 를 번갈아 써서 하루 산출을 두 배로 만들었다). 유료 전환 뒤
 * 그 이유가 사라졌으므로 기본 모델과 같은 것을 가리킨다 — 옛 명령줄이 깨지지 않게
 * 인자는 계속 받되, 아무 일도 하지 않는다.
 */
export function resolveScriptModel(argv: string[] = process.argv): string {
  const arg = argv.find(a => a.startsWith('--model='));
  const value = arg ? arg.split('=')[1] : '';
  if (!value || value === 'lite') return SCRIPT_GEMINI_MODEL;
  return value;
}

/** REST 로 직접 부르는 스크립트가 쓰는 엔드포인트. API 버전도 여기서 한 번만 정한다. */
export const scriptGenerateContentUrl = (apiKey: string, model: string = SCRIPT_GEMINI_MODEL) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
