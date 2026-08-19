/**
 * `model.ts` 의 ESM 판 — `.mjs` 스크립트는 ts-node 를 거치지 않아 TS 파일을 import 할 수
 * 없다. 그래서 값을 한 번 더 적는다.
 *
 * 🔴 **두 파일이 갈라지면 안 된다.** `__tests__/gemini-model-sync.test.ts` 가 두 값을
 *    대조한다 — 여기를 고치면 `model.ts` 도 같이 고쳐라. 근거와 주의사항(특히 모델을
 *    바꾼 뒤 예문 길이를 반드시 대조해야 하는 이유)은 `model.ts` 주석에 있다.
 */
export const SCRIPT_GEMINI_MODEL = 'gemini-3.5-flash-lite';

export function resolveScriptModel(argv = process.argv) {
  const arg = argv.find(a => a.startsWith('--model='));
  const value = arg ? arg.split('=')[1] : '';
  if (!value || value === 'lite') return SCRIPT_GEMINI_MODEL;
  return value;
}

export const scriptGenerateContentUrl = (apiKey, model = SCRIPT_GEMINI_MODEL) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
