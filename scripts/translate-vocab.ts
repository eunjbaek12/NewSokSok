/**
 * 어휘 목록(NAWL/BSL/NGSL 등)을 Gemini로 번역합니다.
 *
 * 실행: npx ts-node scripts/translate-vocab.ts <list-name>
 *   예) npx ts-node scripts/translate-vocab.ts nawl
 *       npx ts-node scripts/translate-vocab.ts bsl
 *       npx ts-node scripts/translate-vocab.ts ngsl
 *
 * 입력: scripts/<list-name>-source.json
 * 출력: scripts/<list-name>-translated.json
 * 진행: scripts/.<list-name>-progress.json (중단 후 재실행 가능)
 */

import fs from 'fs';
import path from 'path';

const LIST_NAME = process.argv[2]?.toLowerCase();
if (!LIST_NAME) {
  console.error('❌ 사용법: npx ts-node scripts/translate-vocab.ts <list-name>');
  console.error('   예: npx ts-node scripts/translate-vocab.ts nawl');
  process.exit(1);
}

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
const SOURCE_PATH = path.resolve(process.cwd(), `scripts/${LIST_NAME}-source.json`);
const OUTPUT_PATH = path.resolve(process.cwd(), `scripts/${LIST_NAME}-translated.json`);
const PROGRESS_PATH = path.resolve(process.cwd(), `scripts/.${LIST_NAME}-progress.json`);

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

const CONTEXT_MAP: Record<string, string> = {
  nawl: 'academic English (university-level, 수능/TOEFL/IELTS)',
  bsl: 'business English (professional workplace, TOEIC/GMAT)',
  ngsl: 'general everyday English (conversation, daily life)',
  tsl: 'TOEIC business and everyday English',
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function translateBatch(batch: SourceEntry[], retry = 0): Promise<TranslatedEntry[]> {
  const context = CONTEXT_MAP[LIST_NAME] ?? 'English';
  const inputJson = JSON.stringify(
    batch.map(e => ({ term: e.term, ...(e.definition ? { definition: e.definition } : {}) })),
    null, 0,
  );

  const prompt = `You are an expert English vocabulary tutor for Korean learners.
Context: ${context}

For each English entry below, provide Korean translation and example sentences.
${batch[0].definition ? 'Input includes a simple English definition as context.' : 'Input is terms only — use your knowledge to generate accurate content.'}

Input:
${inputJson}

Return ONLY a JSON array (no markdown, no explanation) with EXACTLY ${batch.length} items in the SAME ORDER.
Each item:
{
  "term": "<copy from input exactly>",
  "definition": "clear, simple English definition (1 sentence)",
  "phonetic": "IPA notation e.g. /ˈwɜːrd/",
  "pos": "noun | verb | adjective | adverb | phrase | idiom",
  "meaningKr": "Korean meaning (1-3 senses, comma-separated). e.g. \\"영향, 효과\\"",
  "exampleEn": "Natural example sentence (10-18 words) in ${context} context",
  "exampleKr": "Natural Korean translation of exampleEn"
}

Rules:
- Return EXACTLY ${batch.length} items, same order as input.
- Do NOT change the term field.
- Korean must be natural and idiomatic, not robotic.
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
        const waitMs = waits[retry] * 1000;
        const label = response.status === 429 ? 'Rate limit' : 'Server busy (503)';
        console.log(`  ⏳ ${label}, ${waits[retry]}초 대기... (${retry + 1}/6)`);
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
    if (parsed.length !== batch.length) throw new Error(`길이 불일치: expected ${batch.length}, got ${parsed.length}`);

    return batch.map((src, i) => {
      const w = parsed[i] ?? {};
      return {
        rank: src.rank,
        term: src.term,
        definition: String(w.definition ?? src.definition ?? ''),
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
  if (fs.existsSync(PROGRESS_PATH)) return JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8'));
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
  console.log(`📚 [${LIST_NAME.toUpperCase()}] ${source.length}개 단어 로드`);

  const done = loadProgress();
  if (done.length > 0) console.log(`📂 진행 파일 발견: ${done.length}개 처리됨, 이어서 시작`);

  const results = [...done];
  const totalBatches = Math.ceil(source.length / BATCH_SIZE);

  for (let i = done.length; i < source.length; i += BATCH_SIZE) {
    const batch = source.slice(i, i + BATCH_SIZE);
    const batchNo = Math.floor(i / BATCH_SIZE) + 1;
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

    if (i + BATCH_SIZE < source.length) await sleep(BATCH_DELAY_MS);
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2));
  console.log(`\n🎉 완료! ${OUTPUT_PATH} (${results.length}개)`);
  if (fs.existsSync(PROGRESS_PATH)) { fs.unlinkSync(PROGRESS_PATH); console.log('진행 파일 정리됨'); }
}

main().catch(e => { console.error('치명적 오류:', e); process.exit(1); });
