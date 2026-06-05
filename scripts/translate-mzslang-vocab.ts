/**
 * 미국 Gen-Z / MZ 슬랭 100을 한국어 뜻 + 발음 + 캐주얼 영어 예문 + 한국어 번역으로 enrich.
 * 방향: en → ko (한국어 사용자가 미국 SNS/일상 슬랭을 배우는 용도). integrate-vocab.ts 의 기본 분기로 통합.
 *
 * 입력: scripts/mzslang-source.json ({rank, term, pos, category, hint})
 * 출력: scripts/mzslang-translated.json
 * 진행 파일: scripts/.mzslang-progress.json (중단 후 재실행 가능)
 *
 * 실행: npx ts-node scripts/translate-mzslang-vocab.ts
 * 옵션:
 *   --limit=N     상위 N개만 처리 (smoke test용)
 *   --model=lite  gemini-2.5-flash-lite 사용 (별도 RPD 버킷, 폴백용)
 */
import fs from 'fs';
import path from 'path';

const limitArg = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : Infinity;
const useLite = process.argv.includes('--model=lite');
const MODEL = useLite ? 'gemini-2.5-flash-lite' : 'gemini-2.5-flash';

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
const SOURCE_PATH = path.resolve(process.cwd(), 'scripts/mzslang-source.json');
const OUTPUT_PATH = path.resolve(process.cwd(), 'scripts/mzslang-translated.json');
const PROGRESS_PATH = path.resolve(process.cwd(), 'scripts/.mzslang-progress.json');

const BATCH_SIZE = 25;
const BATCH_DELAY_MS = 5000;

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
  definition: string;  // 영어 정의(= source hint, 카드 보조 글로스)
  phonetic: string;
  pos: string;
  meaningKr: string;
  exampleEn: string;
  exampleKr: string;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function translateBatch(batch: SourceEntry[], retry = 0): Promise<TranslatedEntry[]> {
  const inputJson = JSON.stringify(
    batch.map(e => ({ term: e.term, hintPos: e.pos, context: e.hint })),
    null, 0,
  );

  const prompt = `You are an expert tutor explaining American Gen-Z / MZ-generation slang to Korean learners.

Each input item is a word or phrase from current American slang — internet, texting, and everyday casual speech. Many are recent neologisms, abbreviations, or memes. The "context" field gives an English gloss to pin down the slang meaning. Trust the context.

Input:
${inputJson}

Return ONLY a JSON array (no markdown, no explanation) with EXACTLY ${batch.length} items in the SAME ORDER.
Each item:
{
  "term": "<copy from input exactly>",
  "phonetic": "Simple English pronunciation guide a Korean reader can follow, written in Hangul. e.g. \\"슬레이\\", \\"노 캡\\", \\"이츠 기빙\\". Keep it short.",
  "pos": "noun | verb | adjective | adverb | phrase | interjection | suffix",
  "meaningKr": "Natural, clear Korean meaning of the slang (1-2 senses). Explain the slang nuance plainly so a Korean learner gets it. 예: \\"끝내주게 잘하다, 완벽하게 해내다\\". Keep it concise.",
  "exampleEn": "A natural, casual English sentence the way a real American Gen-Z person would text or post it, actually using the term. Friendly, fun, modern tone. 8-16 words.",
  "exampleKr": "Natural, casual Korean translation of exampleEn (how a Korean would actually say it)."
}

Rules:
- Return EXACTLY ${batch.length} items, same order as input.
- Do NOT change the term field — copy exactly.
- Keep everything SFW and friendly: no profanity, no sexual, drug, violent, or offensive content. If a term has an edgy side, use only its clean, fun everyday sense.
- The example MUST actually use the term and sound like real casual talk, not a stiff textbook sentence.
- meaningKr must reflect the slang sense from "context", never an unrelated literal dictionary meaning.
- Korean must be natural and idiomatic, not robotic.
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
        definition: src.hint,
        phonetic: String(w.phonetic ?? ''),
        pos: String(w.pos ?? src.pos),
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
