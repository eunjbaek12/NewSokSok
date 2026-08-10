import { GoogleGenAI, Type } from '@google/genai';
import { AIWordResultSchema, type AIWordResult } from '@shared/contracts';
import { assembleTopText, normalizeSenses } from '@/lib/senses';
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

// BYOK 키 자체가 거부된 경우 판별 — 오타·폐기된 키·Generative Language API 미활성이
// 모두 여기 들어온다. quota와 달리 기다려도 풀리지 않으므로 UI가 "키를 확인하라"고
// 말할 수 있어야 한다. 이 구분이 없던 동안에는 키가 틀려도 조용히 무료 사전으로
// 떨어져, 사용자는 뜻만 안 채워지는 이유를 알 수 없었다.
//
// 401/403은 인증·권한이라 무조건 키 문제지만, 400(INVALID_ARGUMENT)은 요청 스키마
// 오류로도 나므로 메시지가 키를 가리킬 때만 인정한다.
export function isInvalidKeyError(e: any): boolean {
  const code = e?.error?.code ?? e?.code ?? e?.status;
  const status = String(e?.error?.status ?? e?.status ?? '');
  if (code === 401 || code === 403) return true;
  if (status === 'PERMISSION_DENIED' || status === 'UNAUTHENTICATED') return true;
  const msg = String(e?.message ?? '');
  return /API_KEY_INVALID|API key not valid|api key expired|PERMISSION_DENIED|UNAUTHENTICATED/i.test(msg);
}

export type ApiKeyCheck = 'valid' | 'invalid' | 'unknown';

/**
 * 키를 저장하기 전에 유효한지 확인한다.
 *
 * 모델 목록 조회를 쓴다 — generateContent와 달리 토큰을 소모하지 않으면서 인증만
 * 검사한다. 'unknown'은 "키가 나쁘다"가 아니라 "확인하지 못했다"이다(네트워크 단절,
 * 서버 5xx). 그 둘을 뭉치면 비행기 모드에서 정당한 키를 저장하지 못한다.
 */
export async function validateApiKey(apiKey: string): Promise<ApiKeyCheck> {
  const key = apiKey.trim();
  if (!key) return 'invalid';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
      { signal: controller.signal },
    );
    if (res.ok) return 'valid';
    if (res.status === 400 || res.status === 401 || res.status === 403) return 'invalid';
    return 'unknown';
  } catch {
    return 'unknown';
  } finally {
    clearTimeout(timer);
  }
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
  const sameLang = srcName === tgtName;
  // 같은 언어쌍은 "번역" 지시가 무의미(no-op)해서 모델이 영어로 이탈하는 실측
  // 사례가 있었다(ko→ko의 senses[].exampleKr가 전부 영어). Edge(gemini-vertex
  // buildPrompt)와 동일 규칙 — 수정 시 함께 갱신.
  const sameLangBlock = sameLang ? `

      SAME-LANGUAGE MODE — the learner's language and the study language are BOTH ${srcName}:
      - "meaningKr" = a short, simpler gloss or synonyms in ${srcName} (easier wording than the definition). NEVER another language.
      - "exampleKr" MUST be an empty string "" — translating an example into the same language is meaningless. Apply this to every "exampleKr" inside "senses" too.` : '';

  const response = await withRetry(() => ai.models.generateContent({
    model: MODEL_NAME,
    contents: `Analyze the ${srcName} word/phrase "${word}".

      FIRST, decide whether "${word}" is a real, recognized ${srcName} word, phrase, idiom, common abbreviation, or proper noun.
      - If YES (or you are reasonably confident it exists), set "isReal" to true and fill in the other fields.
      - If it appears to be a typo, gibberish, random characters, or you cannot find any recognized meaning, set "isReal" to false and return EMPTY STRINGS for all other text fields. Do NOT invent a plausible-sounding definition. Be lenient toward real but uncommon entries (slang, neologisms, technical terms, dialect, proper nouns) — only mark false when there is genuinely no recognizable meaning.

      When isReal is true, provide:
      1. A simple definition in ${srcName}.
      2. One example sentence in ${srcName}. The sentence MUST actually use "${word}" — either verbatim or as an inflected/conjugated form of it. NEVER replace it with a synonym or a paraphrase. (The app hides this word inside the sentence to make a fill-in-the-blank exercise, so a sentence that does not contain it is unusable.) This applies to every example sentence inside "senses" too.
      3. The meaning translated into ${tgtName}.
      4. The part of speech (pos), ALWAYS written in English: noun, verb, adjective, adverb, pronoun, preposition, conjunction, interjection, determiner, phrase, idiom. The app groups and filters words by these exact English terms, so a translated label ("sustantivo", "名詞", "danh từ", "명사") is unusable. This applies to every "pos" inside "senses" too.
      5. The phonetic transcription. Notation for ${srcName}: ${getPhoneticInstruction(sourceLang)}
      6. A translation of the example sentence in ${tgtName}.

      HOMONYMS: If "${word}" has two or more distinct, unrelated meanings (homonyms — e.g., the Korean word "사과" means both "apple" and "apology"):
      - FIRST fix N, the number of distinct senses you will report (2 or 3). N then binds every field: the "senses" array MUST hold exactly N entries, and the numbered lists in "definition" and "meaningKr" MUST hold exactly N items in the same order. The app draws one chip per array entry and shows the numbered text beside them, so 3 entries with only ①② written out leaves a chip that nothing explains.
      - "senses": exactly N entries, most common first. Each entry covers exactly ONE sense with NO numbering inside: a short meaning gloss, definition, one example sentence with its translation, pos, and phonetic for that sense.
      - "definition" and "meaningKr": exactly N items numbered ①②③, each a short gloss of a few words — NOT a full definition sentence (e.g., "① apple (the fruit) ② apology"). Begin the text AT "①" — never put a summary line, a combined definition, or any other text before it, and add nothing after the last item.
      - "exampleEn", "exampleKr", "pos", and "phonetic" at the top level: use only the most common sense (①).
      - The inventory of distinct senses — how many, which ones, and their frequency order — is a property of the ${srcName} word ALONE and must be IDENTICAL no matter what the learner's language is. Fill EVERY field of every sense; never leave a field blank${sameLang ? ' (exception: "exampleKr" is an empty string in same-language mode)' : ''}.
      If the word has a single meaning (or only minor variations of one core meaning), return an empty "senses" array and use NO numbering anywhere — "definition" and "meaningKr" must then be plain text with no ①②③ in them at all. Do NOT number minor variations of one core meaning.

      IMPORTANT — Field naming is legacy and MUST be ignored:
      - "meaningKr" is NOT Korean. Put the meaning in ${tgtName}.
      - "exampleKr" is NOT Korean. Put the example translation in ${tgtName}.
      - "exampleEn" is NOT English. Put the example sentence in ${srcName}.
      Use ONLY ${srcName}${sameLang ? '' : ` and ${tgtName}`} anywhere in the output — never any other language. The ONE exception is "pos" (top level and inside "senses"), which stays in English as specified in 4.${sameLangBlock}`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          isReal: { type: Type.BOOLEAN, description: `True if "${word}" is a recognized ${srcName} word/phrase/idiom/proper noun. False if it appears to be a typo, gibberish, or unrecognizable.` },
          term: { type: Type.STRING, description: `The original word in ${srcName}` },
          definition: { type: Type.STRING, description: `A simple definition written in ${srcName}. For homonyms, exactly one numbered item (①②③) per "senses" entry, in the same order, starting AT "①" with no summary line before it. No numbering at all when "senses" is empty. Empty string if isReal is false.` },
          exampleEn: { type: Type.STRING, description: `An example sentence written in ${srcName} (field name is legacy; not necessarily English). MUST contain "${word}" itself (verbatim or inflected) — never a synonym. Empty string if isReal is false.` },
          exampleKr: { type: Type.STRING, description: `The example sentence translated into ${tgtName} (field name is legacy; not necessarily Korean). Empty string if isReal is false.` },
          meaningKr: { type: Type.STRING, description: `The meaning of the word translated into ${tgtName} (field name is legacy; not necessarily Korean). For homonyms, exactly one numbered item (①②③) per "senses" entry, in the same order, starting AT "①" with no summary line before it. No numbering at all when "senses" is empty. Empty string if isReal is false.` },
          pos: { type: Type.STRING, description: 'Part of speech in ENGLISH ONLY (noun, verb, adjective, adverb, pronoun, preposition, conjunction, interjection, determiner, phrase, idiom) — never translated into the source or target language. Empty string if isReal is false.' },
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
                pos: { type: Type.STRING, description: 'Part of speech of this sense, in ENGLISH ONLY — never translated.' },
                phonetic: { type: Type.STRING, description: 'Phonetic transcription of this sense (may differ per sense, e.g., English "lead").' },
              },
              required: ['meaningKr', 'definition', 'exampleEn', 'exampleKr', 'pos', 'phonetic'],
            },
          },
        },
        // exampleKr(예문 번역)은 일부러 필수에서 뺀다. 같은 언어쌍으로 배우는 사람에게는
        // 존재할 이유가 없는 칸이라("빈 문자열로 두라"고 지시한다), 필수로 만들면 비우라는
        // 지시와 채우라는 신호가 겹친다 — v5 에서 ko>ko 의 senses[].exampleKr 가 통째로
        // 영어로 이탈한 전례가 있는 필드다. 다른 언어쌍에서는 프롬프트 6번과 필드 설명이
        // 이미 요구하고 있고, v7 실측 137건에서 이 칸이 빈 결함은 나오지 않았다.
        required: ['isReal', 'term', 'definition', 'exampleEn', 'meaningKr', 'pos', 'phonetic', 'senses'],
      },
    },
  }));

  const parsed = parseAIJson<AIWordResult>(response.text, AIWordResultSchema, 'analyzeWord');

  // 뜻이 2개 이상이면 상위 병기 텍스트는 senses 에서 다시 만든다 — 모델이 쓴 텍스트는
  // 배열보다 뜻이 적은 경우가 실측 15%였다(assembleTopText 주석). Edge 경로
  // (_shared/gemini-vertex.ts)도 같은 처리를 하므로 BYOK 여부와 무관하게 결과가 같다.
  const senses = normalizeSenses(parsed.senses);
  if (!senses) return parsed;
  return {
    ...parsed,
    meaningKr: assembleTopText(senses, 'meaningKr') || parsed.meaningKr,
    definition: assembleTopText(senses, 'definition') || parsed.definition,
    senses,
  };
}

