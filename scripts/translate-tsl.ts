/**
 * TSL(TOEIC Service List) 상위 600 단어에 한국어 뜻/예문/발음/품사를 채워
 * scripts/tsl-top600-translated.json 으로 저장합니다.
 *
 * 입력: scripts/tsl-top600-source.json  (rank, sfi, term, definition)
 * 출력: scripts/tsl-top600-translated.json
 * 진행: scripts/.tsl-progress.json (배치 단위 체크포인트, 중단 후 재실행 가능)
 *
 * 실행: npx tsx scripts/translate-tsl.ts
 */

import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env');
let GEMINI_API_KEY = '';
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const match = envContent.match(/EXPO_PUBLIC_GEMINI_API_KEY=(.*)/);
  if (match) GEMINI_API_KEY = match[1].trim();
}

if (!GEMINI_API_KEY) {
  console.error('❌ EXPO_PUBLIC_GEMINI_API_KEY가 .env에 없습니다.');
  process.exit(1);
}

const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`;

const SOURCE_PATH = path.resolve(process.cwd(), 'scripts/tsl-top600-source.json');
const OUTPUT_PATH = path.resolve(process.cwd(), 'scripts/tsl-top600-translated.json');
const PROGRESS_PATH = path.resolve(process.cwd(), 'scripts/.tsl-progress.json');

const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 5000;

interface SourceEntry {
  rank: number;
  sfi: number | null;
  term: string;
  definition: string;
}

interface TranslatedEntry {
  rank: number;
  term: string;
  definition: string;
  phonetic: string;
  pos: string;
  meaningKr: string;
  exampleEn: string;
  exampleKr: string;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function translateBatch(batch: SourceEntry[], retry = 0): Promise<TranslatedEntry[]> {
  const inputJson = JSON.stringify(
    batch.map(e => ({ term: e.term, definition: e.definition })),
    null,
    0,
  );

  const prompt = `You are an expert TOEIC vocabulary tutor for Korean learners.
For each English entry below, fill in Korean translation and example sentences.

Input (English term + simple English definition):
${inputJson}

Return ONLY a JSON array (no markdown, no explanation) with the SAME ORDER and SAME LENGTH as input.
Each item must have:
{
  "term": "<copy from input>",
  "phonetic": "IPA pronunciation, e.g. /ˈklaɪənt/",
  "pos": "noun | verb | adjective | adverb | phrase | idiom",
  "meaningKr": "Concise Korean meaning (1-3 senses, comma-separated). e.g. \\"고객, 의뢰인\\"",
  "exampleEn": "A natural example sentence (10-18 words) in TOEIC business/everyday context",
  "exampleKr": "Natural Korean translation of exampleEn"
}

Rules:
- Return EXACTLY ${batch.length} items in the same order as input.
- Do NOT change or reorder the term field.
- exampleEn should reflect realistic TOEIC contexts (office, travel, shopping, schedule, etc.).
- Korean must be natural; do not use robotic literal translation.
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
      if (response.status === 429 && retry < 4) {
        const waitMs = (retry + 1) * 30000;
        console.log(`  ⏳ Rate limit, ${waitMs / 1000}초 대기...`);
        await sleep(waitMs);
        return translateBatch(batch, retry + 1);
      }
      throw new Error(`API 오류 (${response.status}): ${err.slice(0, 300)}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('API 응답이 비어있습니다.');

    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed: any[] = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) throw new Error('응답이 배열이 아님');
    if (parsed.length !== batch.length) {
      throw new Error(`길이 불일치: expected ${batch.length}, got ${parsed.length}`);
    }

    return batch.map((src, i) => {
      const w = parsed[i] ?? {};
      return {
        rank: src.rank,
        term: src.term,
        definition: src.definition,
        phonetic: String(w.phonetic ?? ''),
        pos: String(w.pos ?? ''),
        meaningKr: String(w.meaningKr ?? ''),
        exampleEn: String(w.exampleEn ?? ''),
        exampleKr: String(w.exampleKr ?? ''),
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
  if (fs.existsSync(PROGRESS_PATH)) {
    return JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8'));
  }
  return [];
}

function saveProgress(items: TranslatedEntry[]) {
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify(items, null, 2));
}

async function main() {
  if (!fs.existsSync(SOURCE_PATH)) {
    console.error(`❌ 소스 파일 없음: ${SOURCE_PATH}`);
    process.exit(1);
  }
  const source: SourceEntry[] = JSON.parse(fs.readFileSync(SOURCE_PATH, 'utf8'));
  console.log(`📚 소스 ${source.length}개 단어 로드`);

  const done = loadProgress();
  if (done.length > 0) {
    console.log(`📂 진행 파일 발견: ${done.length}개 처리됨, 이어서 시작`);
  }

  const startIdx = done.length;
  const results = [...done];

  for (let i = startIdx; i < source.length; i += BATCH_SIZE) {
    const batch = source.slice(i, i + BATCH_SIZE);
    const batchNo = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(source.length / BATCH_SIZE);
    console.log(`\n[${batchNo}/${totalBatches}] rank ${batch[0].rank}~${batch[batch.length - 1].rank} (${batch.length}개)`);

    try {
      const translated = await translateBatch(batch);
      results.push(...translated);
      saveProgress(results);
      console.log(`  ✅ ${translated.length}개 번역 완료 (총 ${results.length}/${source.length})`);
    } catch (e: any) {
      console.error(`  ❌ 배치 ${batchNo} 실패: ${e.message}`);
      console.error('진행 상황은 저장됨. 동일 명령으로 재실행하면 이어집니다.');
      process.exit(1);
    }

    if (i + BATCH_SIZE < source.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2));
  console.log(`\n🎉 완료! ${OUTPUT_PATH}`);
  console.log(`총 ${results.length}개 단어`);

  if (fs.existsSync(PROGRESS_PATH)) {
    fs.unlinkSync(PROGRESS_PATH);
    console.log('진행 파일 정리됨');
  }
}

main().catch(e => {
  console.error('치명적 오류:', e);
  process.exit(1);
});
