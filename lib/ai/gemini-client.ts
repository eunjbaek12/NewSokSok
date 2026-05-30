import { GoogleGenAI, Type } from '@google/genai';
import { AIWordResultSchema, type AIWordResult } from '@shared/contracts';
import { fromZodError } from 'zod-validation-error';

const MODEL_NAME = 'gemini-2.5-flash-lite';

function getAIClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({ apiKey });
}

// 모델 과부하(503/UNAVAILABLE)만 일시적이라 짧은 백오프로 재시도한다.
// 429/RESOURCE_EXHAUSTED(quota 소진)는 일일 한도라 수십 초~다음날까지 안 풀리므로
// 재시도하지 않는다 — 재시도해봐야 지연만 늘고 남은 한도만 더 깎는다.
//
// @google/genai의 ApiError는 상태 코드를 구조화된 프로퍼티가 아니라 e.message에
// JSON 문자열로 담는다(예: '{"error":{"code":503,"status":"UNAVAILABLE"}}'). 따라서
// 프로퍼티와 메시지 문자열을 모두 검사한다.
// BYOK 키의 일일 quota 소진(429/RESOURCE_EXHAUSTED) 판별. UI 안내용.
export function isQuotaError(e: any): boolean {
  const code = e?.error?.code ?? e?.code ?? e?.status;
  const status = String(e?.error?.status ?? e?.status ?? '');
  if (code === 429 || status === 'RESOURCE_EXHAUSTED') return true;
  const msg = String(e?.message ?? '');
  return /\b429\b|RESOURCE_EXHAUSTED|exceeded your current quota/i.test(msg);
}

function isTransient(e: any): boolean {
  const code = e?.error?.code ?? e?.code ?? e?.status;
  const status = String(e?.error?.status ?? e?.status ?? '');
  if (code === 503 || status === 'UNAVAILABLE') {
    return true;
  }
  const msg = String(e?.message ?? '');
  return /\b503\b|UNAVAILABLE|overloaded|high demand/i.test(msg);
}

async function withRetry<T>(fn: () => Promise<T>, retries = 2, baseDelayMs = 600): Promise<T> {
  let lastErr: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      if (attempt === retries || !isTransient(e)) throw e;
      await new Promise(r => setTimeout(r, baseDelayMs * (attempt + 1)));
    }
  }
  throw lastErr;
}

function getFullLanguageName(code: string): string {
  const map: Record<string, string> = {
    en: 'English', ko: 'Korean', ja: 'Japanese', zh: 'Chinese', vi: 'Vietnamese', es: 'Spanish',
  };
  return map[code] || code;
}

function parseAIJson<T>(
  text: string | undefined,
  schema: { safeParse(v: unknown): { success: boolean; data?: T; error?: any } },
  context: string,
): T {
  if (!text) throw new Error(`No response from AI (${context})`);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e: any) {
    throw new Error(`AI response was not valid JSON (${context}): ${e?.message}`);
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const readable = fromZodError(result.error);
    throw new Error(`AI response failed validation (${context}): ${readable.message}`);
  }
  return result.data as T;
}

export async function analyzeWord(
  word: string,
  sourceLang: string,
  targetLang: string,
  apiKey: string,
): Promise<AIWordResult> {
  const ai = getAIClient(apiKey);
  const srcName = getFullLanguageName(sourceLang);
  const tgtName = getFullLanguageName(targetLang);

  const response = await withRetry(() => ai.models.generateContent({
    model: MODEL_NAME,
    contents: `Analyze the ${srcName} word/phrase "${word}". Provide:
      1. A simple definition in ${srcName}.
      2. One example sentence in ${srcName}.
      3. The meaning translated into ${tgtName}.
      4. A "mnemonic" to help remember the word easily, written in ${tgtName}.
      5. The part of speech (pos, e.g., noun, verb).
      6. The phonetic transcription.
      7. A translation of the example sentence in ${tgtName}.

      IMPORTANT — Field naming is legacy and MUST be ignored:
      - "meaningKr" is NOT Korean. Put the meaning in ${tgtName}.
      - "exampleKr" is NOT Korean. Put the example translation in ${tgtName}.
      - "exampleEn" is NOT English. Put the example sentence in ${srcName}.
      - "mnemonic" must be written in ${tgtName}.
      Do not output ${srcName === 'Korean' || tgtName === 'Korean' ? 'any other language' : 'Korean'} unless ${tgtName} or ${srcName} is Korean.`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          term: { type: Type.STRING, description: `The original word in ${srcName}` },
          definition: { type: Type.STRING, description: `A simple definition written in ${srcName}` },
          exampleEn: { type: Type.STRING, description: `An example sentence written in ${srcName} (field name is legacy; not necessarily English)` },
          exampleKr: { type: Type.STRING, description: `The example sentence translated into ${tgtName} (field name is legacy; not necessarily Korean)` },
          meaningKr: { type: Type.STRING, description: `The meaning of the word translated into ${tgtName} (field name is legacy; not necessarily Korean)` },
          mnemonic: { type: Type.STRING, description: `A memory aid written in ${tgtName}` },
          pos: { type: Type.STRING, description: 'Part of speech (e.g., noun, verb)' },
          phonetic: { type: Type.STRING, description: 'Phonetic transcription (IPA)' },
        },
        required: ['term', 'definition', 'exampleEn', 'meaningKr', 'mnemonic', 'pos', 'phonetic'],
      },
    },
  }));

  return parseAIJson<AIWordResult>(response.text, AIWordResultSchema, 'analyzeWord');
}

