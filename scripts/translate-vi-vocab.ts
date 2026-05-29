/**
 * 베트남어 단어를 Gemini로 한국어 뜻·예문 + 영어 정의 + 품사 enrich.
 *
 * 입력: scripts/vi-source.json (build-vi-source.ts 산출)
 * 출력: scripts/vi-translated.json
 * 진행 파일: scripts/.vi-progress.json (중단 후 재실행 가능)
 *
 * 실행: npx ts-node scripts/translate-vi-vocab.ts
 * 옵션: --limit N  → 상위 N개만 처리 (smoke test용)
 *
 * JP/ZH와 차이:
 *   - phonetic: 베트남어 정자법에 성조·발음 포함 → 비워둠
 *   - pos: 베트남어 사전이 없어 Gemini가 생성
 *   - definition: 영어 정의도 Gemini가 생성 (CC-CEDICT/JMdict 대체)
 */
import fs from 'fs';
import path from 'path';

const limitArg = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : Infinity;

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

// 모델별로 free tier RPD 카운터가 분리됨. gemini-flash-latest(=2.5-flash) quota 소진 시
// gemini-2.5-flash-lite로 전환해 별도 quota 사용. 품질은 prod 앱(lib/ai/gemini-client.ts)이
// 동일 모델 사용 중이라 검증된 수준.
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
const SOURCE_PATH = path.resolve(process.cwd(), 'scripts/vi-source.json');
const OUTPUT_PATH = path.resolve(process.cwd(), 'scripts/vi-translated.json');
const PROGRESS_PATH = path.resolve(process.cwd(), 'scripts/.vi-progress.json');

const BATCH_SIZE = 25;
const BATCH_DELAY_MS = 5000;

interface SourceEntry {
  rank: number;
  term: string;
  pos: string;
  definition: string;
  category: string;
}

interface TranslatedEntry {
  rank: number;
  term: string;
  pos: string;
  definition: string;
  phonetic: string;
  meaningKr: string;
  exampleVi: string;
  exampleKr: string;
  category: string;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function translateBatch(batch: SourceEntry[], retry = 0): Promise<TranslatedEntry[]> {
  const inputJson = JSON.stringify(batch.map(e => ({ term: e.term })), null, 0);

  const prompt = `You are an expert Vietnamese vocabulary tutor for Korean learners.

For each Vietnamese term, provide:
- pos: Part of speech (one of: noun, verb, adjective, adverb, pronoun, conjunction, preposition, particle, classifier, interjection, number).
- definition: A simple English definition (1 sentence).
- meaningKr: Korean meaning (1-3 senses, comma-separated). 예: "가다, 출발하다"
- exampleVi: Natural Vietnamese sentence (6-14 syllables) using the term at basic A1-A2 level grammar and vocabulary.
- exampleKr: Natural Korean translation of exampleVi.

Input:
${inputJson}

Return ONLY a JSON array (no markdown, no explanation) with EXACTLY ${batch.length} items in the SAME ORDER as input.
Each item:
{
  "term": "<copy from input exactly>",
  "pos": "...",
  "definition": "...",
  "meaningKr": "...",
  "exampleVi": "...",
  "exampleKr": "..."
}

Rules:
- Return EXACTLY ${batch.length} items, same order as input.
- Do NOT change the term field — copy exactly.
- Korean must be natural and idiomatic (not literal word-for-word).
- Example sentence must use the term and be A1-A2 difficulty.
- Vietnamese orthography includes tone marks — copy them exactly.
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
        pos: String(w.pos ?? ''),
        definition: String(w.definition ?? ''),
        phonetic: '', // 베트남어는 정자법에 발음 포함
        meaningKr: String(w.meaningKr ?? ''),
        exampleVi: String(w.exampleVi ?? ''),
        exampleKr: String(w.exampleKr ?? ''),
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
    console.error(`❌ 소스 없음: ${SOURCE_PATH}. build-vi-source.ts 먼저 실행.`);
    process.exit(1);
  }
  const all: SourceEntry[] = JSON.parse(fs.readFileSync(SOURCE_PATH, 'utf8'));
  const source = all.slice(0, Math.min(LIMIT, all.length));
  console.log(`📚 ${source.length}개 단어 처리 (전체 ${all.length}개${LIMIT < all.length ? `, --limit=${LIMIT}` : ''})`);

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
