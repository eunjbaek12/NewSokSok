/**
 * 한국어 중급 단어를 Gemini로 영어 뜻·예문으로 enrich (외국인 학습자용, ko→en).
 *
 * 입력: scripts/ko-intermediate-source.json (build-ko-intermediate-source.ts 산출)
 * 출력: scripts/ko-intermediate-translated.json
 * 진행 파일: scripts/.ko-intermediate-progress.json (중단 후 재실행 가능)
 *
 * 실행: npx ts-node scripts/translate-ko-intermediate-vocab.ts
 * 옵션:
 *   --limit=N     상위 N개만 처리 (smoke test용)
 *   --model=NAME  모델 지정 (기본값·주의사항은 scripts/_shared/model.ts)
 *
 * Basic 500과 출력 스키마 동일(meaningEn/romaja/exampleKo/exampleEn). 예문 난이도만 TOPIK 3~4.
 */
import fs from 'fs';
import path from 'path';
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
const SOURCE_PATH = path.resolve(process.cwd(), 'scripts/ko-intermediate-source.json');
const OUTPUT_PATH = path.resolve(process.cwd(), 'scripts/ko-intermediate-translated.json');
const PROGRESS_PATH = path.resolve(process.cwd(), 'scripts/.ko-intermediate-progress.json');

const BATCH_SIZE = 25;
const BATCH_DELAY_MS = 5000;

interface SourceEntry {
  rank: number;
  origRank: number;
  term: string;
  pos: string;
  grade: string;
  definition: string;
  category: string;
}

interface TranslatedEntry {
  rank: number;
  term: string;
  pos: string;
  grade: string;
  meaningEn: string;
  romaja: string;
  exampleKo: string;
  exampleEn: string;
  category: string;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function translateBatch(batch: SourceEntry[], retry = 0): Promise<TranslatedEntry[]> {
  const inputJson = JSON.stringify(
    batch.map(e => ({ term: e.term, hintPos: e.pos })),
    null, 0,
  );

  const prompt = `You are an expert Korean vocabulary tutor for English-speaking intermediate learners.

For each Korean word, provide an English meaning, Revised Romanization, a natural intermediate Korean example sentence, and its English translation.

Input:
${inputJson}

The "hintPos" is a rough part-of-speech guess and is occasionally wrong — judge the ACTUAL most common part of speech of the Korean word yourself.

Return ONLY a JSON array (no markdown, no explanation) with EXACTLY ${batch.length} items in the SAME ORDER.
Each item:
{
  "term": "<copy from input exactly, Hangul>",
  "pos": "noun | verb | adjective | adverb | pronoun | numeral | interjection | determiner | dependent noun",
  "meaningEn": "English meaning (1-3 senses, comma-separated). e.g. \\"to face, to deal with\\"",
  "romaja": "Revised Romanization of the term. e.g. \\"daehada\\"",
  "exampleKo": "Natural intermediate Korean sentence (8-15 words) using the term. TOPIK level 3-4 grammar and vocabulary.",
  "exampleEn": "Natural English translation of exampleKo."
}

Rules:
- Return EXACTLY ${batch.length} items, same order as input.
- Do NOT change the term field — copy exactly.
- English must be natural and idiomatic.
- Example must be TOPIK 3-4 difficulty (intermediate vocabulary, connectives like -지만/-는데/-아서/-(으)면, common modal endings), Hangul only.
- Avoid overly literary or formal sentences; aim for realistic everyday/work/study contexts.
- For abstract or grammatical-flavored words (대하다, 위하다, 통하다, 따르다, etc.), pick the most useful learner-facing sense and a clear contextual example.
- Return ONLY the JSON array.`;

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, responseMimeType: 'application/json' },
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
        grade: src.grade,
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
    console.error(`❌ 소스 없음: ${SOURCE_PATH}. build-ko-intermediate-source.ts 먼저 실행.`);
    process.exit(1);
  }
  const all: SourceEntry[] = JSON.parse(fs.readFileSync(SOURCE_PATH, 'utf8'));
  const source = all.slice(0, Math.min(LIMIT, all.length));
  console.log(`📚 ${source.length}개 단어 처리 (전체 ${all.length}개${LIMIT < all.length ? `, --limit=${LIMIT}` : ''}, model=${MODEL})`);

  const done = loadProgress();
  if (done.length > 0) console.log(`📂 진행 ${done.length}개 발견, 이어서 시작`);

  const results = [...done];
  const totalBatches = Math.ceil(source.length / BATCH_SIZE);

  for (let i = done.length; i < source.length; i += BATCH_SIZE) {
    const batch = source.slice(i, i + BATCH_SIZE);
    const batchNo = Math.floor(i / BATCH_SIZE) + 1;
    console.log(`\n[${batchNo}/${totalBatches}] rank ${batch[0].rank}~${batch[batch.length - 1].rank}`);
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
  if (fs.existsSync(PROGRESS_PATH)) { fs.unlinkSync(PROGRESS_PATH); console.log('진행 파일 정리됨'); }
}

main().catch(e => { console.error('치명적 오류:', e); process.exit(1); });
