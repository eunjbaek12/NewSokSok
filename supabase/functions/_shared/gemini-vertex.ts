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

// 예문의 화계(speech level). 지시가 없으면 모델이 문장마다 임의로 고르고, 초급 학습자는
// 교재가 먼저 가르치는 화계와 어긋난 예문을 받는다(2026-08-17 제보: 세종한국어 교재로
// 공부하는 ko>en 학습자 — 이 앱의 2위 언어쌍이다).
// 화계가 문법적으로 필수인 언어만 넣는다. 영어·중국어는 필수가 아니고, 스페인어(tú/usted)는
// UI 번역을 tú로 통일해 둔 터라 예문만 usted로 갈라지면 오히려 어긋난다.
// ⚠️ 같은 함수가 4개 파일에 복제돼 있다 — __tests__/register-note-sync.test.ts 가 강제한다.
const REGISTER_LEVEL: Record<string, string> = {
  ko: 'Korean 해요체 (-아요/-어요/-예요/-세요) — never 합쇼체 (-습니다/-ㅂ니다) and never 반말',
  ja: 'Japanese です/ます — never 常体 (だ/である)',
};

function buildRegisterNote(sourceLang: string): string {
  const level = REGISTER_LEVEL[sourceLang];
  if (!level) return '';
  return `
REGISTER — write EVERY example sentence in ${level}. This is the everyday polite level textbooks teach first. Keep it consistent across all sentences, including those inside "senses".`;
}

// 동음이의어 뜻 후보 1개(단일 뜻 기준, 내부 번호 없음). 클라이언트 WordSenseSchema와 동일 형태.
export interface AnalyzedSense {
  meaningKr: string;
  definition?: string;
  exampleEn?: string;
  exampleKr?: string;
  pos?: string;
  phonetic?: string;
}

export interface AnalyzedWord {
  term: string;
  definition: string;
  exampleEn: string;
  exampleKr: string;
  meaningKr: string;
  pos: string;
  phonetic: string;
  // 단어가 사전에 존재한다고 모델이 판단했는지. 옛 캐시·옛 응답은 undefined로 통과(=실재로 간주).
  isReal?: boolean;
  // 동음이의어 뜻 후보(2개 이상일 때만 포함). 상위 필드는 병기(①②) 하위호환용.
  senses?: AnalyzedSense[];
}

export async function analyzeWord(
  word: string,
  sourceLang: string,
  targetLang: string,
  allowProperNouns = true,
): Promise<AnalyzedWord> {
  const projectId = Deno.env.get('VERTEX_PROJECT_ID');
  const location = Deno.env.get('VERTEX_LOCATION') ?? 'us-central1';
  const model = Deno.env.get('VERTEX_MODEL') ?? DEFAULT_MODEL;
  if (!projectId) throw new Error('VERTEX_PROJECT_ID not configured');

  const srcName = LANG_NAME[sourceLang] ?? sourceLang;
  const tgtName = LANG_NAME[targetLang] ?? targetLang;
  // 검색(enrich)도 생성과 동일한 언어별 발음 표기 규칙을 따르게 통일.
  const phoneticInstr = PHONETIC_INSTRUCTION[sourceLang] ?? '해당 언어의 표준 발음 표기 (IPA)';
  const registerNote = buildRegisterNote(sourceLang);

  const token = await getVertexAccessToken();

  const endpoint =
    `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}` +
    `/locations/${location}/publishers/google/models/${model}:generateContent`;

  const prompt = buildPrompt(word, srcName, tgtName, phoneticInstr, allowProperNouns, registerNote);

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

  // senses는 뜻이 2개 이상일 때만 응답에 포함(빈 배열·1개는 의미 없음 → 생략).
  // 캐시(enrich_cache)에 result가 통째로 저장되므로 여기서 정리해야 캐시도 깨끗하다.
  const senses = Array.isArray(parsed.senses)
    ? parsed.senses.filter((s): s is AnalyzedSense =>
        !!s && typeof s === 'object' && typeof s.meaningKr === 'string' && s.meaningKr.trim().length > 0,
      ).slice(0, 3)
    : [];

  // 뜻이 2개 이상이면 상위 병기 텍스트는 모델이 쓴 것을 버리고 senses 에서 조립한다.
  // 같은 내용을 배열과 텍스트로 두 번 쓰게 시키면 어긋나기 때문이다(v7 실측 220건 중
  // 34건에서 텍스트가 배열보다 적었고, 그렇게 사라진 뜻이 46개였다. 반대로 텍스트가
  // 더 많은 경우는 0건 — 손실이 한 방향이라 배열을 정본으로 삼으면 잃는 것이 없다).
  // ko>en "먹다" 는 칩에 세 뜻이 다 있는데 텍스트는 "to eat" 하나뿐이었다.
  const multi = senses.length >= 2;
  return {
    term: parsed.term ?? word,
    definition: (multi && joinSenses(senses, 'definition')) || parsed.definition || '',
    exampleEn: parsed.exampleEn ?? '',
    exampleKr: parsed.exampleKr ?? '',
    meaningKr: (multi && joinSenses(senses, 'meaningKr')) || parsed.meaningKr || '',
    pos: parsed.pos ?? '',
    phonetic: parsed.phonetic ?? '',
    isReal: parsed.isReal,
    ...(multi ? { senses } : {}),
  };
}

// senses 를 ①②③ 병기 한 줄로 잇는다. 클라이언트 lib/senses.ts 의 composeSenseFill 과
// 같은 규칙을 쓴다 — 저장 스키마가 제어문자를 막으므로(NO_CONTROL) 줄바꿈이 아니라 공백으로 잇고,
// 빈 항목은 번호째 건너뛰어 뜻 번호와의 대응을 유지한다.
// ⚠️ senses[] 안에 이미 번호가 박혀 오는 경우가 실측 4% 있어(vi>es "lại" → "① ① de nuevo")
//    앞 번호를 벗기고 붙인다.
const SENSE_MARKS = ['①', '②', '③', '④'];
function joinSenses(list: AnalyzedSense[], key: 'meaningKr' | 'definition'): string {
  return list
    .map((s, i) => {
      const v = (s[key] ?? '').replace(/^\s*[①②③④]\s*/, '').trim();
      return v ? `${SENSE_MARKS[i]} ${v}` : '';
    })
    .filter(Boolean)
    .join(' ');
}

function buildPrompt(
  word: string,
  srcName: string,
  tgtName: string,
  phoneticInstr: string,
  allowProperNouns: boolean,
  registerNote: string,
): string {
  const sameLang = srcName === tgtName;
  // 같은 언어쌍은 "번역" 지시가 무의미(no-op)해서 모델이 영어로 이탈하는 실측
  // 사례가 있었다(v5, ko→ko의 senses[].exampleKr가 전부 영어). 뜻은 쉬운 뜻풀이로,
  // 예문 번역은 아예 비우도록 명시한다.
  const sameLangBlock = sameLang ? `

SAME-LANGUAGE MODE — the learner's language and the study language are BOTH ${srcName}:
- "meaningKr" = a short, simpler gloss or synonyms in ${srcName} (easier wording than the definition). NEVER another language.
- "exampleKr" MUST be an empty string "" — translating an example into the same language is meaningless. Apply this to every "exampleKr" inside "senses" too.` : '';
  const properNounBlock = allowProperNouns ? '' : `

COMMON-VOCABULARY SEEDING MODE:
- ACCEPT useful forms that learners actually encounter: inflected forms (plurals, tenses, participles), contractions, and widely understood abbreviations. Explain the relationship to the base form in the definition and meaning. The example sentence MUST contain the exact input surface form, not only its lemma (for "rights", use "rights", not only "right").
- ACCEPT countries, globally prominent cities or regions, and globally familiar brands/services when the entry has clear everyday learning value.
- REJECT entries that are primarily an ordinary person's given name or surname, an obscure local place, a minor organization/product/title/fictional character, a username, a single-letter corpus fragment, or an ambiguous letter fragment with no broadly understood standalone meaning. For rejected entries, set "isReal" to false and return empty text fields.
- A proper noun that also has a useful common dictionary meaning remains accepted for that ordinary meaning.`;
  return `Analyze the ${srcName} word/phrase "${word}".

FIRST, decide whether "${word}" is a real, recognized ${srcName} word, phrase, idiom, common abbreviation, or proper noun.
- If YES (or you are reasonably confident it exists), set "isReal" to true and fill in the other fields.
- If it appears to be a typo, gibberish, random characters, or you cannot find any recognized meaning, set "isReal" to false and return EMPTY STRINGS for all other text fields. Do NOT invent a plausible-sounding definition. Be lenient toward real but uncommon entries (slang, neologisms, technical terms, dialect${allowProperNouns ? ', proper nouns' : ''}) — only mark false when there is genuinely no recognizable meaning.${properNounBlock}

When isReal is true, provide:
1. A simple definition in ${srcName}.
2. One example sentence in ${srcName}. The sentence MUST actually use "${word}" — either verbatim or as an inflected/conjugated form of it. NEVER replace it with a synonym or a paraphrase. (The app hides this word inside the sentence to make a fill-in-the-blank exercise, so a sentence that does not contain it is unusable.) This applies to every example sentence inside "senses" too.
3. The meaning translated into ${tgtName}.
4. The part of speech (pos), ALWAYS written in English: noun, verb, adjective, adverb, pronoun, preposition, conjunction, interjection, determiner, phrase, idiom. The app groups and filters words by these exact English terms, so a translated label ("sustantivo", "名詞", "danh từ", "명사") is unusable. This applies to every "pos" inside "senses" too.
5. The phonetic transcription. Notation for ${srcName}: ${phoneticInstr}
6. A translation of the example sentence in ${tgtName}.
${registerNote}

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
Use ONLY ${srcName}${sameLang ? '' : ` and ${tgtName}`} anywhere in the output — never any other language. The ONE exception is "pos" (top level and inside "senses"), which stays in English as specified in 4.${sameLangBlock}`;
}

function responseSchema(srcName: string, tgtName: string) {
  return {
    type: 'OBJECT',
    properties: {
      isReal:     { type: 'BOOLEAN', description: `True if the input is a recognized ${srcName} entry; false if gibberish/typo.` },
      term:       { type: 'STRING' },
      definition: { type: 'STRING', description: `Definition in ${srcName}. For homonyms, exactly one numbered item (①②③) per "senses" entry, in the same order, starting AT "①" with no summary line before it. No numbering at all when "senses" is empty. Empty if isReal=false.` },
      exampleEn:  { type: 'STRING', description: `Example sentence in ${srcName}. MUST contain the entry word itself (verbatim or inflected) — never a synonym. Empty if isReal=false.` },
      exampleKr:  { type: 'STRING', description: `Example translation in ${tgtName}. Empty if isReal=false.` },
      meaningKr:  { type: 'STRING', description: `Meaning translated into ${tgtName}. For homonyms, exactly one numbered item (①②③) per "senses" entry, in the same order, starting AT "①" with no summary line before it. No numbering at all when "senses" is empty. Empty if isReal=false.` },
      pos:        { type: 'STRING', description: 'Part of speech in ENGLISH ONLY (noun, verb, adjective, adverb, pronoun, preposition, conjunction, interjection, determiner, phrase, idiom) — never translated into the source or target language.' },
      phonetic:   { type: 'STRING' },
      senses: {
        type: 'ARRAY',
        description: 'Homonyms only: one entry per distinct, unrelated sense (2-3, most common first), each single-sense with no numbering. Empty array for single-meaning words or when isReal=false.',
        items: {
          type: 'OBJECT',
          properties: {
            meaningKr:  { type: 'STRING', description: `Short gloss of this sense in ${tgtName}.` },
            definition: { type: 'STRING', description: `Definition of this sense in ${srcName}.` },
            exampleEn:  { type: 'STRING', description: `Example sentence for this sense in ${srcName}.` },
            exampleKr:  { type: 'STRING', description: `The example translated into ${tgtName}.` },
            pos:        { type: 'STRING', description: 'Part of speech of this sense, in ENGLISH ONLY — never translated.' },
            phonetic:   { type: 'STRING', description: 'May differ per sense (e.g., English "lead").' },
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
  ja: '후리가나 — 히라가나·가타카나로만. 한글·로마자 전사 금지, 괄호 병기 금지, 공백 없이. 표제어가 이미 가나뿐이면 그대로 반복한다 (예: 会議 → かいぎ, ワイン → ワイン, ここ → ここ)',
  zh: '병음 (성조 포함, 예: nǐ hǎo)',
  vi: 'IPA 발음기호 (성조 막대 기호 없이 분절음만 — 성조는 철자의 성조 부호로 충분, 예: đi → ɗi)',
  es: 'IPA 발음기호 (예: gracias → ˈɡɾasjas)',
};

// 🔴 한국어 라벨(`${tgtLabel} 뜻`)만으로는 부족하다 — 모델이 필드 **이름**의 Kr/En 을
// 언어 지시로 읽고 라벨을 이긴다. 실측(2026-08-17, 이 모델·temp 0.7): en>en 6/6 이 뜻을
// 한국어로, en>es 는 예문 번역을 한국어로 냈다. 주제어를 영어로 넣어도 같았으므로 원인은
// 주제어가 아니라 필드명이다. analyzeWord 쪽 반박 블록과 같은 문구를 쓴다.
// 같은 프롬프트가 3곳에 복제돼 있다 — __tests__/generate-prompt-legacy-field-sync.test.ts 가 강제한다.
function buildLegacyFieldNote(sourceLang: string, targetLang: string): string {
  const srcName = LANG_NAME[sourceLang] ?? sourceLang;
  const tgtName = LANG_NAME[targetLang] ?? targetLang;
  // tags 는 예외로 두지 않는다 — 주제어를 그대로 태그로 쓰는 게 기본이고(클라이언트가
  // tags 가 비면 query 로 채운다), 예외를 늘리면 "pos 만 영어" 지시가 흐려진다.
  return `
  IMPORTANT — Field naming is legacy and MUST be ignored:
  - "meaningKr" is NOT Korean. Put the meaning in ${tgtName}.
  - "exampleKr" is NOT Korean. Put the example translation in ${tgtName}.
  - "exampleEn" is NOT English. Put the example sentence in ${srcName}.
  Use ONLY ${srcName}${sourceLang === targetLang ? '' : ` and ${tgtName}`} anywhere in the output — never any other language. The ONE exception is "pos", which stays in English.`;
}

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
  // same-lang 지시는 반박 블록 **뒤**에 온다 — exampleKr 에 대해 두 지시가 충돌하므로
  // (번역하라 vs 빈 문자열) 나중에 오는 쪽이 이기게 한다. analyzeWord 도 같은 순서다.
  const sameLangNote = sourceLang === targetLang
    ? `\n  (참고: 학습 언어와 모국어가 같음. 동의어·유의어 또는 고급 어휘 위주로 생성. meaningKr=같은 언어의 쉬운 뜻풀이, exampleKr=빈 문자열 "" — 같은 언어로의 예문 번역은 무의미. 다른 언어 절대 금지.)`
    : '';
  const excludeNote = excludeTerms && excludeTerms.length > 0
    ? `\n  중요: 다음 단어들은 절대 포함하지 말고 새로운 단어로만 ${wordCount}개 생성해줘 — ${excludeTerms.join(', ')}`
    : '';
  return `성인 학습자가 '${query}' 상황에서 사용할 수 있는 ${diffLabel} ${srcLabel} 단어 ${wordCount}개를 생성해줘.${excludeNote}
  응답은 오직 JSON 배열만 반환해야 해. 모든 필드를 빠짐없이 채워야 하며, 비워두지 마.
  - term: ${srcLabel} 단어
  - pos: 품사 — 영어 전체 단어로 (예: noun, verb, adjective, adverb)
  - phonetic: ${phoneticInstr}
  - definition: ${srcLabel}로 작성한 정의
  - meaningKr: ${tgtLabel} 뜻
  - exampleEn: ${srcLabel} 예문
  - exampleKr: 위 예문의 ${tgtLabel} 번역
  - tags: 주제 태그 배열
  포맷: [{"term": "단어", "pos": "noun", "phonetic": "발음기호", "definition": "${srcLabel} 정의", "meaningKr": "${tgtLabel} 뜻", "exampleEn": "${srcLabel} 예문", "exampleKr": "${tgtLabel} 번역", "tags": ["${query}"]}]
${buildRegisterNote(sourceLang)}${buildLegacyFieldNote(sourceLang, targetLang)}${sameLangNote}`;
}

// ────────────────────────────────────────────────────────────
// 이미지 → 단어 추출 (사진 스캔). 표면형 단어 배열 [{word}] 반환.
// 의미·예문 보강은 추출 후 enrich-word로 단어별 처리(클라이언트 큐).
// ────────────────────────────────────────────────────────────
const LANG_NAMES_EN: Record<string, string> = {
  en: 'English', ko: 'Korean', ja: 'Japanese', zh: 'Chinese', vi: 'Vietnamese', es: 'Spanish',
};

// 사진 추출 프롬프트. 교착어(ko/ja)는 사진 텍스트가 활용·조사결합형이라 표면형을
// 그대로 뽑으면 "하는중입니다" 같은 문장 덩어리가 나온다 → 사전 기본형을 요청한다.
// 그 외(en/es/vi/zh)는 표면형이 곧 학습 가치라 현행 유지.
// ⚠️ 클라이언트 lib/gemini-api.ts의 동일 프롬프트와 함께 갱신할 것.
function buildExtractPrompt(langName: string, sourceLang: string): string {
  const isAgglutinative = sourceLang === 'ko' || sourceLang === 'ja';
  const formInstr = isAgglutinative
    ? `Return each entry in its DICTIONARY BASE FORM (the headword a learner would look up): strip attached particles and verb/adjective conjugation endings. For example, Korean "하는중입니다" → "하다", "학교에서" → "학교"; Japanese conjugated forms → 辞書形 (dictionary form).`
    : `Preserve each word's surface form exactly as it appears; do not lemmatize.`;
  return `Extract the ${langName} vocabulary visible in the image. Extract individual vocabulary words only — never full sentences, clauses, or particle-attached phrases. ${formInstr} Only include words written in ${langName}. IGNORE any text in other languages or scripts. Return ONLY a JSON array. Format: [{"word":"..."}]`;
}

export async function extractWordsFromImage(
  base64Image: string,
  sourceLang: string,
): Promise<unknown[]> {
  const projectId = Deno.env.get('VERTEX_PROJECT_ID');
  const location = Deno.env.get('VERTEX_LOCATION') ?? 'us-central1';
  const model = Deno.env.get('VERTEX_MODEL') ?? DEFAULT_MODEL;
  if (!projectId) throw new Error('VERTEX_PROJECT_ID not configured');

  const langName = LANG_NAMES_EN[sourceLang] ?? 'English';
  const extractPrompt = buildExtractPrompt(langName, sourceLang);
  const token = await getVertexAccessToken();
  const endpoint =
    `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}` +
    `/locations/${location}/publishers/google/models/${model}:generateContent`;

  const body = {
    contents: [{
      role: 'user',
      parts: [
        { text: extractPrompt },
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
