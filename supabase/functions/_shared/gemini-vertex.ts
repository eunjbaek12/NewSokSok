// Vertex AI Gemini REST 호출.
// 클라이언트와 동일한 응답 스키마를 유지해 클라이언트 파서 재사용.
//
// 환경변수:
//   VERTEX_PROJECT_ID    GCP 프로젝트 ID
//   VERTEX_LOCATION      예: us-central1, asia-northeast3
//   VERTEX_MODEL         예: gemini-2.5-flash-lite (기본값)

import { getVertexAccessToken } from './vertex-auth.ts';

const DEFAULT_MODEL = 'gemini-2.5-flash-lite';

const LANG_NAME: Record<string, string> = {
  en: 'English', ko: 'Korean', ja: 'Japanese', zh: 'Chinese', vi: 'Vietnamese', es: 'Spanish',
};

export interface AnalyzedWord {
  term: string;
  definition: string;
  exampleEn: string;
  exampleKr: string;
  meaningKr: string;
  mnemonic: string;
  pos: string;
  phonetic: string;
  // 단어가 사전에 존재한다고 모델이 판단했는지. 옛 캐시·옛 응답은 undefined로 통과(=실재로 간주).
  isReal?: boolean;
}

export async function analyzeWord(
  word: string,
  sourceLang: string,
  targetLang: string,
): Promise<AnalyzedWord> {
  const projectId = Deno.env.get('VERTEX_PROJECT_ID');
  const location = Deno.env.get('VERTEX_LOCATION') ?? 'us-central1';
  const model = Deno.env.get('VERTEX_MODEL') ?? DEFAULT_MODEL;
  if (!projectId) throw new Error('VERTEX_PROJECT_ID not configured');

  const srcName = LANG_NAME[sourceLang] ?? sourceLang;
  const tgtName = LANG_NAME[targetLang] ?? targetLang;
  // 검색(enrich)도 생성과 동일한 언어별 발음 표기 규칙을 따르게 통일.
  const phoneticInstr = PHONETIC_INSTRUCTION[sourceLang] ?? '해당 언어의 표준 발음 표기 (IPA)';

  const token = await getVertexAccessToken();

  const endpoint =
    `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}` +
    `/locations/${location}/publishers/google/models/${model}:generateContent`;

  const prompt = buildPrompt(word, srcName, tgtName, phoneticInstr);

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: responseSchema(srcName, tgtName),
      temperature: 0.4,
    },
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`vertex gemini call failed (${res.status}): ${text}`);
  }

  const json = await res.json() as VertexResponse;
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('vertex gemini returned no text');
  }

  let parsed: Partial<AnalyzedWord>;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`vertex gemini returned non-JSON: ${(e as Error).message}`);
  }

  return {
    term: parsed.term ?? word,
    definition: parsed.definition ?? '',
    exampleEn: parsed.exampleEn ?? '',
    exampleKr: parsed.exampleKr ?? '',
    meaningKr: parsed.meaningKr ?? '',
    mnemonic: parsed.mnemonic ?? '',
    pos: parsed.pos ?? '',
    phonetic: parsed.phonetic ?? '',
    isReal: parsed.isReal,
  };
}

function buildPrompt(word: string, srcName: string, tgtName: string, phoneticInstr: string): string {
  const avoid = srcName === 'Korean' || tgtName === 'Korean' ? 'any other language' : 'Korean';
  return `Analyze the ${srcName} word/phrase "${word}".

FIRST, decide whether "${word}" is a real, recognized ${srcName} word, phrase, idiom, common abbreviation, or proper noun.
- If YES (or you are reasonably confident it exists), set "isReal" to true and fill in the other fields.
- If it appears to be a typo, gibberish, random characters, or you cannot find any recognized meaning, set "isReal" to false and return EMPTY STRINGS for all other text fields. Do NOT invent a plausible-sounding definition. Be lenient toward real but uncommon entries (slang, neologisms, technical terms, dialect, proper nouns) — only mark false when there is genuinely no recognizable meaning.

When isReal is true, provide:
1. A simple definition in ${srcName}.
2. One example sentence in ${srcName}.
3. The meaning translated into ${tgtName}.
4. A "mnemonic" to help remember the word easily, written in ${tgtName}.
5. The part of speech (pos, e.g., noun, verb).
6. The phonetic transcription. Notation for ${srcName}: ${phoneticInstr}
7. A translation of the example sentence in ${tgtName}.

IMPORTANT — Field naming is legacy and MUST be ignored:
- "meaningKr" is NOT Korean. Put the meaning in ${tgtName}.
- "exampleKr" is NOT Korean. Put the example translation in ${tgtName}.
- "exampleEn" is NOT English. Put the example sentence in ${srcName}.
- "mnemonic" must be written in ${tgtName}.
Do not output ${avoid} unless ${tgtName} or ${srcName} is Korean.`;
}

function responseSchema(srcName: string, tgtName: string) {
  return {
    type: 'OBJECT',
    properties: {
      isReal:     { type: 'BOOLEAN', description: `True if the input is a recognized ${srcName} entry; false if gibberish/typo.` },
      term:       { type: 'STRING' },
      definition: { type: 'STRING', description: `Definition in ${srcName}. Empty if isReal=false.` },
      exampleEn:  { type: 'STRING', description: `Example sentence in ${srcName}. Empty if isReal=false.` },
      exampleKr:  { type: 'STRING', description: `Example translation in ${tgtName}. Empty if isReal=false.` },
      meaningKr:  { type: 'STRING', description: `Meaning translated into ${tgtName}. Empty if isReal=false.` },
      mnemonic:   { type: 'STRING', description: `Memory aid in ${tgtName}. Empty if isReal=false.` },
      pos:        { type: 'STRING' },
      phonetic:   { type: 'STRING' },
    },
    required: ['isReal', 'term', 'definition', 'exampleEn', 'meaningKr', 'mnemonic', 'pos', 'phonetic'],
  };
}

interface VertexResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
}

// ────────────────────────────────────────────────────────────
// 주제 → 단어 목록 생성 (AI 단어 생성)
// 클라이언트 features/curation/screen.tsx의 buildPrompt를 그대로 이식.
// 응답은 JSON 배열(각 항목: term/pos/phonetic/definition/meaningKr/exampleEn/exampleKr/tags).
// 검증·매핑은 클라이언트가 AIWordResultSchema로 수행하므로 여기선 배열 파싱까지만.
// ────────────────────────────────────────────────────────────

const LANG_LABEL_KO: Record<string, string> = {
  en: '영어', ko: '한국어', ja: '일본어', zh: '중국어', vi: '베트남어', es: '스페인어',
};

const DIFFICULTY_PROMPT: Record<string, string> = {
  beginner: '초급 수준의 쉬운',
  intermediate: '중급 수준의',
  advanced: '고급/전문적인',
};

// 발음 표기는 도착어(독자)에 독립적이어야 세계인 대상 앱에서 통한다. 그래서 도착어
// 문자(한글 등)가 아니라 각 출발어의 국제/표준 표기를 쓴다: en/es/vi=IPA, ja=후리가나,
// zh=병음, ko=로마자(RR). 한글 전사(그라시아스 등)는 한국어 독자 전용이라 배제.
const PHONETIC_INSTRUCTION: Record<string, string> = {
  en: 'IPA 발음기호 (슬래시 없이, 예: prəˈnʌnsiˌeɪʃən)',
  ko: '로마자 표기 (국립국어원 로마자 표기법, 예: 안녕 → annyeong, 값 → gap)',
  ja: '후리가나 (예: ありがとう)',
  zh: '병음 (성조 포함, 예: nǐ hǎo)',
  vi: 'IPA 발음기호 (성조 포함, 예: đi → ɗi˧˧)',
  es: 'IPA 발음기호 (예: gracias → ˈɡɾasjas)',
};

function buildGeneratePrompt(
  query: string,
  wordCount: number,
  difficulty: string,
  sourceLang: string,
  targetLang: string,
  excludeTerms?: string[],
): string {
  const diffLabel = DIFFICULTY_PROMPT[difficulty] ?? '중급 수준의';
  const srcLabel = LANG_LABEL_KO[sourceLang] ?? sourceLang;
  const tgtLabel = LANG_LABEL_KO[targetLang] ?? targetLang;
  const phoneticInstr = PHONETIC_INSTRUCTION[sourceLang] ?? '해당 언어의 표준 발음 표기';
  const sameLangNote = sourceLang === targetLang
    ? `\n  (참고: 학습 언어와 모국어가 같음. 동의어·유의어 또는 고급 어휘 위주로 생성.)`
    : '';
  const excludeNote = excludeTerms && excludeTerms.length > 0
    ? `\n  중요: 다음 단어들은 절대 포함하지 말고 새로운 단어로만 ${wordCount}개 생성해줘 — ${excludeTerms.join(', ')}`
    : '';
  return `성인 학습자가 '${query}' 상황에서 사용할 수 있는 ${diffLabel} ${srcLabel} 단어 ${wordCount}개를 생성해줘.${sameLangNote}${excludeNote}
  응답은 오직 JSON 배열만 반환해야 해. 모든 필드를 빠짐없이 채워야 하며, 비워두지 마.
  - term: ${srcLabel} 단어
  - pos: 품사 — 영어 전체 단어로 (예: noun, verb, adjective, adverb)
  - phonetic: ${phoneticInstr}
  - definition: ${srcLabel}로 작성한 정의
  - meaningKr: ${tgtLabel} 뜻
  - exampleEn: ${srcLabel} 예문
  - exampleKr: 위 예문의 ${tgtLabel} 번역
  - tags: 주제 태그 배열
  포맷: [{"term": "단어", "pos": "noun", "phonetic": "발음기호", "definition": "${srcLabel} 정의", "meaningKr": "${tgtLabel} 뜻", "exampleEn": "${srcLabel} 예문", "exampleKr": "${tgtLabel} 번역", "tags": ["${query}"]}]`;
}

// ────────────────────────────────────────────────────────────
// 이미지 → 단어 추출 (사진 스캔). 표면형 단어 배열 [{word}] 반환.
// 의미·예문 보강은 추출 후 enrich-word로 단어별 처리(클라이언트 큐).
// ────────────────────────────────────────────────────────────
const LANG_NAMES_EN: Record<string, string> = {
  en: 'English', ko: 'Korean', ja: 'Japanese', zh: 'Chinese', vi: 'Vietnamese', es: 'Spanish',
};

export async function extractWordsFromImage(
  base64Image: string,
  sourceLang: string,
): Promise<unknown[]> {
  const projectId = Deno.env.get('VERTEX_PROJECT_ID');
  const location = Deno.env.get('VERTEX_LOCATION') ?? 'us-central1';
  const model = Deno.env.get('VERTEX_MODEL') ?? DEFAULT_MODEL;
  if (!projectId) throw new Error('VERTEX_PROJECT_ID not configured');

  const langName = LANG_NAMES_EN[sourceLang] ?? 'English';
  const token = await getVertexAccessToken();
  const endpoint =
    `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}` +
    `/locations/${location}/publishers/google/models/${model}:generateContent`;

  const body = {
    contents: [{
      role: 'user',
      parts: [
        { text: `Extract every ${langName} word visible in the image, exactly as it appears (preserve surface form, do not lemmatize). Return ONLY a JSON array. Format: [{"word":"..."}]` },
        { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
      ],
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1,
    },
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`vertex image extract failed (${res.status}): ${text}`);
  }

  const json = await res.json() as VertexResponse;
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('vertex image extract returned no text');

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`vertex image extract returned non-JSON: ${(e as Error).message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error('vertex image extract did not return an array');
  }
  return parsed;
}

export async function generateWords(
  query: string,
  wordCount: number,
  difficulty: string,
  sourceLang: string,
  targetLang: string,
  excludeTerms?: string[],
): Promise<unknown[]> {
  const projectId = Deno.env.get('VERTEX_PROJECT_ID');
  const location = Deno.env.get('VERTEX_LOCATION') ?? 'us-central1';
  const model = Deno.env.get('VERTEX_MODEL') ?? DEFAULT_MODEL;
  if (!projectId) throw new Error('VERTEX_PROJECT_ID not configured');

  const t0 = performance.now();
  const token = await getVertexAccessToken();
  const tToken = performance.now();

  const endpoint =
    `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}` +
    `/locations/${location}/publishers/google/models/${model}:generateContent`;

  const prompt = buildGeneratePrompt(query, wordCount, difficulty, sourceLang, targetLang, excludeTerms);

  // 출력 길이 상한. 단어당 약 250토큰(7~8필드 + 예문) + 여유 버퍼로 산정해
  // 모델이 폭주(장황한 JSON)하는 꼬리 지연을 막되, 정상 출력은 잘리지 않게 넉넉히.
  const maxOutputTokens = Math.min(16384, wordCount * 250 + 1024);

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.7,
      maxOutputTokens,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(
      `[generate-words:timing] FAILED status=${res.status} ` +
      `token=${(tToken - t0).toFixed(0)}ms vertex=${(performance.now() - tToken).toFixed(0)}ms`,
    );
    throw new Error(`vertex generate call failed (${res.status}): ${text}`);
  }

  const json = await res.json() as VertexResponse;
  const tVertex = performance.now();
  // 응답이 maxOutputTokens에 막혀 잘렸는지 확인 — 잘리면 아래 JSON.parse가 실패하므로 원인 진단용 로그.
  const finishReason = (json as { candidates?: Array<{ finishReason?: string }> })
    ?.candidates?.[0]?.finishReason;
  let text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  text = text.trim();
  if (text.startsWith('```')) {
    const firstNewLine = text.indexOf('\n');
    const lastBacktick = text.lastIndexOf('```');
    if (firstNewLine !== -1 && lastBacktick !== -1) {
      text = text.slice(firstNewLine, lastBacktick).trim();
    }
  }
  if (!text) throw new Error('vertex generate returned no text');

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    console.error(
      `[generate-words:timing] PARSE_FAIL finishReason=${finishReason} ` +
      `maxOutputTokens=${maxOutputTokens} textLen=${text.length}`,
    );
    throw new Error(`vertex generate returned non-JSON: ${(e as Error).message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error('vertex generate did not return an array');
  }

  const tParse = performance.now();
  console.log(
    `[generate-words:timing] token=${(tToken - t0).toFixed(0)}ms ` +
    `vertex=${(tVertex - tToken).toFixed(0)}ms parse=${(tParse - tVertex).toFixed(0)}ms ` +
    `total=${(tParse - t0).toFixed(0)}ms reqWords=${wordCount} gotWords=${parsed.length} ` +
    `finishReason=${finishReason} maxOutputTokens=${maxOutputTokens} location=${location} model=${model}`,
  );

  return parsed;
}
