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

// 발음 표기는 도착어(독자)에 독립적인 각 출발어의 표준 표기를 쓴다(세계인 대상).
// en/es/vi=IPA, ja=후리가나, zh=병음, ko=로마자(RR). 생성 경로(gemini-vertex/curation)와 동일 규칙.
function getPhoneticInstruction(code: string): string {
  const map: Record<string, string> = {
    en: 'IPA (no slashes, e.g., prəˈnʌnsiˌeɪʃən)',
    ko: 'Revised Romanization of Korean (e.g., 안녕 → annyeong, 값 → gap)',
    ja: 'furigana in kana (e.g., ありがとう)',
    zh: 'Pinyin with tone marks (e.g., nǐ hǎo)',
    vi: 'IPA segmentals only, WITHOUT tone letters/bars — tones are already shown by the orthography (e.g., đi → ɗi)',
    es: 'IPA (e.g., gracias → ˈɡɾasjas)',
  };
  return map[code] || 'the standard phonetic notation (IPA) for the source language';
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
    contents: `Analyze the ${srcName} word/phrase "${word}".

      FIRST, decide whether "${word}" is a real, recognized ${srcName} word, phrase, idiom, common abbreviation, or proper noun.
      - If YES (or you are reasonably confident it exists), set "isReal" to true and fill in the other fields.
      - If it appears to be a typo, gibberish, random characters, or you cannot find any recognized meaning, set "isReal" to false and return EMPTY STRINGS for all other text fields. Do NOT invent a plausible-sounding definition. Be lenient toward real but uncommon entries (slang, neologisms, technical terms, dialect, proper nouns) — only mark false when there is genuinely no recognizable meaning.

      When isReal is true, provide:
      1. A simple definition in ${srcName}.
      2. One example sentence in ${srcName}.
      3. The meaning translated into ${tgtName}.
      4. A "mnemonic" to help remember the word easily, written in ${tgtName}.
      5. The part of speech (pos, e.g., noun, verb).
      6. The phonetic transcription. Notation for ${srcName}: ${getPhoneticInstruction(sourceLang)}
      7. A translation of the example sentence in ${tgtName}.

      HOMONYMS: If "${word}" has two or more distinct, unrelated meanings (homonyms — e.g., the Korean word "사과" means both "apple" and "apology"):
      - Top-level fields combine the senses: the meaning field MUST list the 2-3 most common senses numbered with ①②③, each as a short gloss of a few words — NOT a full definition sentence (e.g., "① apple (the fruit) ② apology"). Number the definition the same way. For the example sentence, pos, and phonetic, use only the most common sense (①).
      - ALSO fill the "senses" array with one entry per distinct sense (2-3, most common first). Each entry covers exactly ONE sense with NO numbering inside: a short meaning gloss, definition, one example sentence with its translation, pos, and phonetic for that sense.
      If the word has a single meaning (or only minor variations of one core meaning), return an empty "senses" array and do not use numbering anywhere. Do NOT number minor variations of one core meaning.

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
          isReal: { type: Type.BOOLEAN, description: `True if "${word}" is a recognized ${srcName} word/phrase/idiom/proper noun. False if it appears to be a typo, gibberish, or unrecognizable.` },
          term: { type: Type.STRING, description: `The original word in ${srcName}` },
          definition: { type: Type.STRING, description: `A simple definition written in ${srcName}. For homonyms, list the top senses numbered ①②. Empty string if isReal is false.` },
          exampleEn: { type: Type.STRING, description: `An example sentence written in ${srcName} (field name is legacy; not necessarily English). Empty string if isReal is false.` },
          exampleKr: { type: Type.STRING, description: `The example sentence translated into ${tgtName} (field name is legacy; not necessarily Korean). Empty string if isReal is false.` },
          meaningKr: { type: Type.STRING, description: `The meaning of the word translated into ${tgtName} (field name is legacy; not necessarily Korean). For homonyms, list the top senses numbered ①②. Empty string if isReal is false.` },
          mnemonic: { type: Type.STRING, description: `A memory aid written in ${tgtName}. Empty string if isReal is false.` },
          pos: { type: Type.STRING, description: 'Part of speech (e.g., noun, verb). Empty string if isReal is false.' },
          phonetic: { type: Type.STRING, description: 'Phonetic transcription using the notation specified for the source language in the prompt. Empty string if isReal is false.' },
          senses: {
            type: Type.ARRAY,
            description: 'Homonyms only: one entry per distinct, unrelated sense (2-3, most common first), each single-sense with no numbering. Empty array for single-meaning words or when isReal is false.',
            items: {
              type: Type.OBJECT,
              properties: {
                meaningKr: { type: Type.STRING, description: `Short gloss of this sense in ${tgtName} (field name is legacy; not necessarily Korean).` },
                definition: { type: Type.STRING, description: `Definition of this sense in ${srcName}.` },
                exampleEn: { type: Type.STRING, description: `Example sentence for this sense in ${srcName}.` },
                exampleKr: { type: Type.STRING, description: `The example translated into ${tgtName}.` },
                pos: { type: Type.STRING, description: 'Part of speech of this sense.' },
                phonetic: { type: Type.STRING, description: 'Phonetic transcription of this sense (may differ per sense, e.g., English "lead").' },
              },
              required: ['meaningKr', 'definition', 'exampleEn', 'exampleKr', 'pos', 'phonetic'],
            },
          },
        },
        required: ['isReal', 'term', 'definition', 'exampleEn', 'meaningKr', 'mnemonic', 'pos', 'phonetic', 'senses'],
      },
    },
  }));

  return parseAIJson<AIWordResult>(response.text, AIWordResultSchema, 'analyzeWord');
}

