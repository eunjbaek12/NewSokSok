/**
 * "영어로 안 떨어지는" 한국어 개념어 50을 영어 뜻 + 로마자 + 구어체 예문 + 영어 번역으로 enrich.
 * 방향: ko → en (영어권 한국어 학습자 대상). integrate-vocab.ts 의 ko→en 분기로 통합.
 *
 * 이 덱의 특수성: 표제어가 전부 "영어 단어 하나로 안 되는" 말이라, 뜻풀이 자체가 학습
 * 내용이다. 그래서 프롬프트가 (1) 가장 가까운 영어 단어를 대고 (2) 그것과 어떻게
 * 다른지를 반드시 쓰게 한다. 한 단어로 환원하면 이 덱은 존재 이유가 없어진다.
 * 반대 위험은 뜻이 길어져 카드를 넘치는 것이라 길이 상한을 걸고 생성 후 검사한다.
 *
 * 입력: scripts/untrans-source.json ({rank, term, pos, category, hint})
 * 출력: scripts/untrans-translated.json
 * 진행 파일: scripts/.untrans-progress.json (중단 후 재실행 가능)
 *
 * 실행: npx ts-node -P tsconfig.scripts.json scripts/translate-untrans-vocab.ts
 * 옵션:
 *   --limit=N     상위 N개만 처리 (smoke test용)
 *   --model=NAME  모델 지정 (기본값·주의사항은 scripts/_shared/model.ts)
 */
import fs from 'fs';
import path from 'path';
import { collectFindings, reportFindings, SHARED_PROMPT_RULES } from './lib/ko-deck-checks';
import { resolveScriptModel } from './_shared/model';

const limitArg = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : Infinity;
const MODEL = resolveScriptModel();

const envPath = path.resolve(process.cwd(), '.env');
let GEMINI_API_KEY = '';
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const match = envContent.match(/^EXPO_PUBLIC_GEMINI_API_KEY=(.*)$/m)
    ?? envContent.match(/^GEMINI_API_KEY=(.*)$/m);
  if (match) GEMINI_API_KEY = match[1].trim();
}
if (!GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY (또는 EXPO_PUBLIC_GEMINI_API_KEY)가 .env에 없습니다.');
  process.exit(1);
}

const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;
const SOURCE_PATH = path.resolve(process.cwd(), 'scripts/untrans-source.json');
const OUTPUT_PATH = path.resolve(process.cwd(), 'scripts/untrans-translated.json');
const PROGRESS_PATH = path.resolve(process.cwd(), 'scripts/.untrans-progress.json');

const BATCH_SIZE = 25;
const BATCH_DELAY_MS = 5000;
// 카드 뒷면 상한. 같은 '문화' 계열 덱 실측이 기준 — mimetic 83자·saguk 86자·kpop 70자
// (평균)이고 최대가 134~159자다. 상한을 150으로 두고 돌렸더니 평균 133자가 나와,
// 기존 덱의 최대치가 이 덱의 평균이 되는 꼴이라 조였다.
const MEANING_MAX = 120;
const MEANING_TARGET = 90;

interface SourceEntry {
  rank: number;
  term: string;
  pos: string;
  category: string;
  hint: string;
}

interface TranslatedEntry {
  rank: number;
  term: string;
  pos: string;
  meaningEn: string;
  romaja: string;
  exampleKo: string;
  exampleEn: string;
  category: string;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function translateBatch(batch: SourceEntry[], retry = 0): Promise<TranslatedEntry[]> {
  const inputJson = JSON.stringify(
    batch.map(e => ({ term: e.term, hintPos: e.pos, context: e.hint })),
    null, 0,
  );

  const prompt = `You are an expert tutor of Korean for English speakers, writing a deck called "Untranslatable Korean".

Every input word is one that English cannot render with a single equivalent — a feeling, a social concept, or a piece of Korean life. The "context" field explains the sense, names the closest English word, and says how the Korean differs. Trust it completely.

But the context is BACKGROUND FOR YOU, not text to be compressed onto the card. It deliberately says more than fits. Your job is to pick the ONE distinction that a learner most needs and write only that. Usage notes, extra senses, collocations and history in the context are there so you choose well — leave them out unless they are the single most useful thing about the word.

Input:
${inputJson}

Return ONLY a JSON array (no markdown, no explanation) with EXACTLY ${batch.length} items in the SAME ORDER.
Each item:
{
  "term": "<copy from input exactly, Hangul>",
  "pos": "noun | pronoun | verb | adjective | adverb",
  "meaningEn": "What the word actually means, written so an English speaker feels it. Where the context names a closest English word, give it and then the difference — the em-dash form works well: \\"quietly hurt that someone close fell short — not anger; it stings because you care\\" (82 chars). MOST ITEMS SHOULD LAND BETWEEN 60 AND ${MEANING_TARGET} CHARACTERS; ${MEANING_MAX} IS A HARD CEILING. One line, no final period. This goes on a flashcard — cut every word that isn't load-bearing, and drop the 'closest English word' clause entirely when the meaning already lands without it. A long meaning is a failure however true it is.",
  "romaja": "Revised Romanization of the term. e.g. \\"nunchi\\", \\"seoun-hada\\", \\"han-teok-naeda\\". Hyphenate at morpheme joins only where it aids reading.",
  "exampleKo": "One natural sentence in modern spoken Korean using the term, in 해요체 or 반말 as a friend would actually say it. 8-16 words, Hangul only. Put it in a CONCRETE situation (a specific person, place, moment) so the feeling is visible — abstract definitions-as-sentences are useless here.",
  "exampleEn": "Natural English translation of exampleKo. Do NOT force a one-word rendering of the headword — translate what the sentence means, the way a good subtitle would."
}

Rules:
- Return EXACTLY ${batch.length} items, same order as input.
- Do NOT change the term field — copy exactly.
- NEVER reduce the word to a single English synonym. If one existed the word would not be in this deck. Name the nearest word, then draw the line between them.
- Do not use the headword itself inside meaningEn, and do not write meaningEn as a dictionary gloss list ("sadness, sorrow, grief") — that is what fails learners for these words.
- exampleKo must contain the term (conjugated naturally if it is a verb or adjective, e.g. 답답하다 → 답답해서).
- Keep every example clean and family-friendly, and keep the register everyday, not literary.
${SHARED_PROMPT_RULES}
- Return ONLY the JSON array.`;

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.8, responseMimeType: 'application/json' },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      if ((response.status === 429 || response.status === 503) && retry < 6) {
        const waits = [15, 30, 60, 120, 300, 600];
        console.log(`  ⏳ ${response.status}, ${waits[retry]}초 대기... (${retry + 1}/6)`);
        await sleep(waits[retry] * 1000);
        return translateBatch(batch, retry + 1);
      }
      throw new Error(`API 오류 (${response.status}): ${err.slice(0, 300)}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('API 응답 비어있음');

    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed: any[] = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) throw new Error('응답이 배열이 아님');
    if (parsed.length !== batch.length) throw new Error(`길이 불일치: ${batch.length} vs ${parsed.length}`);

    return batch.map((src, i) => {
      const w = parsed[i] ?? {};
      return {
        rank: src.rank,
        term: src.term,
        pos: String(w.pos ?? src.pos),
        meaningEn: String(w.meaningEn ?? ''),
        romaja: String(w.romaja ?? ''),
        exampleKo: String(w.exampleKo ?? ''),
        exampleEn: String(w.exampleEn ?? ''),
        category: src.category,
      };
    });
  } catch (e: any) {
    if (retry < 2) {
      console.log(`  ⚠️ ${e.message}, 5초 후 재시도...`);
      await sleep(5000);
      return translateBatch(batch, retry + 1);
    }
    throw e;
  }
}

function loadProgress(): TranslatedEntry[] {
  if (fs.existsSync(PROGRESS_PATH)) return JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8'));
  return [];
}
function saveProgress(items: TranslatedEntry[]) {
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify(items, null, 2));
}

async function main() {
  if (!fs.existsSync(SOURCE_PATH)) {
    console.error(`❌ 소스 없음: ${SOURCE_PATH}`);
    process.exit(1);
  }
  const all: SourceEntry[] = JSON.parse(fs.readFileSync(SOURCE_PATH, 'utf8'));
  const source = all.slice(0, Math.min(LIMIT, all.length));
  console.log(`📚 ${source.length}개 처리 (전체 ${all.length}개${LIMIT < all.length ? `, --limit=${LIMIT}` : ''}, model=${MODEL})`);

  const done = loadProgress();
  if (done.length > 0) console.log(`📂 진행 ${done.length}개 발견, 이어서 시작`);

  const results = [...done];
  const totalBatches = Math.ceil(source.length / BATCH_SIZE);

  for (let i = done.length; i < source.length; i += BATCH_SIZE) {
    const batch = source.slice(i, i + BATCH_SIZE);
    const batchNo = Math.floor(i / BATCH_SIZE) + 1;
    console.log(`\n[${batchNo}/${totalBatches}] rank ${batch[0].rank}~${batch[batch.length - 1].rank} (${batch[0].category})`);
    try {
      const translated = await translateBatch(batch);
      results.push(...translated);
      saveProgress(results);
      console.log(`  ✅ ${translated.length}개 완료 (총 ${results.length}/${source.length})`);
    } catch (e: any) {
      console.error(`  ❌ 배치 ${batchNo} 실패: ${e.message}`);
      console.error('진행 저장됨. 동일 명령으로 재실행하면 이어집니다.');
      process.exit(1);
    }
    if (i + BATCH_SIZE < source.length) await sleep(BATCH_DELAY_MS);
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2));
  console.log(`\n🎉 완료! ${OUTPUT_PATH} (${results.length}개)`);
  reportFindings(collectFindings(results, { meaningMax: MEANING_MAX }), results.length);
  if (fs.existsSync(PROGRESS_PATH)) { fs.unlinkSync(PROGRESS_PATH); console.log('진행 파일 정리됨'); }
}

main().catch(e => { console.error('치명적 오류:', e); process.exit(1); });
