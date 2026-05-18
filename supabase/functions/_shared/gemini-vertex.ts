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
  en: 'English', ko: 'Korean', ja: 'Japanese', zh: 'Chinese',
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

  const token = await getVertexAccessToken();

  const endpoint =
    `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}` +
    `/locations/${location}/publishers/google/models/${model}:generateContent`;

  const prompt = buildPrompt(word, srcName, tgtName);

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
  };
}

function buildPrompt(word: string, srcName: string, tgtName: string): string {
  const avoid = srcName === 'Korean' || tgtName === 'Korean' ? 'any other language' : 'Korean';
  return `Analyze the ${srcName} word/phrase "${word}". Provide:
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
Do not output ${avoid} unless ${tgtName} or ${srcName} is Korean.`;
}

function responseSchema(srcName: string, tgtName: string) {
  return {
    type: 'OBJECT',
    properties: {
      term:       { type: 'STRING' },
      definition: { type: 'STRING', description: `Definition in ${srcName}` },
      exampleEn:  { type: 'STRING', description: `Example sentence in ${srcName}` },
      exampleKr:  { type: 'STRING', description: `Example translation in ${tgtName}` },
      meaningKr:  { type: 'STRING', description: `Meaning translated into ${tgtName}` },
      mnemonic:   { type: 'STRING', description: `Memory aid in ${tgtName}` },
      pos:        { type: 'STRING' },
      phonetic:   { type: 'STRING' },
    },
    required: ['term', 'definition', 'exampleEn', 'meaningKr', 'mnemonic', 'pos', 'phonetic'],
  };
}

interface VertexResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
}
