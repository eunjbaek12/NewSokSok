/**
 * 중국 Gen-Z / MZ 인터넷 슬랭 100을 한국어 뜻 + 병음 + 캐주얼 중국어 예문 + 한국어 번역으로 enrich.
 * 방향: zh → ko (중국어 학습자·중화권 콘텐츠 팬인 한국 사용자 대상). integrate-vocab.ts 의 일반(비 ko→en) 분기로 통합.
 *
 * 입력: scripts/zhslang-source.json ({rank, term, reading, pos, category, hint})
 * 출력: scripts/zhslang-translated.json
 * 진행 파일: scripts/.zhslang-progress.json (중단 후 재실행 가능)
 *
 * 실행: npx ts-node scripts/translate-zhslang-vocab.ts
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
const SOURCE_PATH = path.resolve(process.cwd(), 'scripts/zhslang-source.json');
const OUTPUT_PATH = path.resolve(process.cwd(), 'scripts/zhslang-translated.json');
const PROGRESS_PATH = path.resolve(process.cwd(), 'scripts/.zhslang-progress.json');

const BATCH_SIZE = 25;
const BATCH_DELAY_MS = 5000;

interface SourceEntry {
  rank: number;
  term: string;
  reading: string;
  pos: string;
  category: string;
  hint: string;
}

interface TranslatedEntry {
  rank: number;
  term: string;
  reading: string;     // 병음 → integrate 에서 phonetic 슬롯
  pos: string;
  definition: string;  // 짧은 영어 뜻
  meaningKr: string;
  exampleZh: string;   // 원어 예문 → integrate 에서 exampleEn 슬롯(zh TTS)
  exampleKr: string;
  category: string;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function translateBatch(batch: SourceEntry[], retry = 0): Promise<TranslatedEntry[]> {
  const inputJson = JSON.stringify(
    batch.map(e => ({ term: e.term, pinyin: e.reading, hintPos: e.pos, context: e.hint })),
    null, 0,
  );

  const prompt = `You are an expert tutor explaining Chinese (Mandarin) Gen-Z / MZ internet slang (网络流行语) to Korean-speaking learners and fans of Chinese online culture.

Each input item is a word, phrase, or initialism used in current Chinese youth slang — on Weibo, Douyin/RED, gaming, and casual chat. Many are recent neologisms, abbreviations, or pinyin-initialisms (e.g. yyds, xswl, awsl). The "pinyin" field gives the reading (may be empty for latin initialisms). The "context" field gives an English gloss to pin down the slang meaning. Trust the context.

Input:
${inputJson}

Return ONLY a JSON array (no markdown, no explanation) with EXACTLY ${batch.length} items in the SAME ORDER.
Each item:
{
  "term": "<copy from input exactly, including simplified Hanzi or latin letters>",
  "pinyin": "Hanyu Pinyin with tone marks of how the term is actually said aloud. For pinyin-initialisms (yyds, xswl, ...) give the pinyin of the spoken full form (e.g. yyds -> \\"yǒngyuǎn de shén\\", xswl -> \\"xiào sǐ wǒ le\\"). For 栓Q -> \\"shuān Q\\".",
  "meaningKr": "Clear, natural Korean meaning in casual terms. Use the equivalent Korean slang/expression when one exists (예: 인싸, 갓생, 현타, 호구, 썸, 드러눕다). 1-2 senses, comma-separated.",
  "definition": "A short English gloss of the slang meaning (3-8 words).",
  "exampleZh": "A natural, casual Chinese sentence as a real Chinese MZ person would text or say it, actually USING the term. Friendly modern chat tone, simplified characters. 8-18 characters. For latin-initialism terms, write the initialism as-is inside the sentence.",
  "exampleKr": "Natural, casual Korean translation of exampleZh (how a Korean peer would actually say it)."
}

Rules:
- Return EXACTLY ${batch.length} items, same order as input.
- Do NOT change the term field — copy exactly.
- Keep everything SFW and friendly: no profanity, no sexual, drug, violent, political, or discriminatory content. Use only the clean, fun everyday sense of each term.
- The Korean output (meaningKr and exampleKr) must also avoid profanity-derived slang: do NOT use 존나/존- forms (e.g. 존웃, 존맛, 존좋), 시발/씨- forms, or any ㅈ/ㅆ-initial vulgar words. Mild everyday slang IS fine (개웃겨, 개쩐다, 대박, 지리다/지린다, 헐, 꿀잼). Just keep the casual tone without vulgar-rooted words.
- The example MUST actually use the term and sound like real casual chat, not a stiff textbook sentence.
- meaningKr must reflect the slang sense from "context", never an unrelated literal dictionary meaning.
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
        reading: String(w.pinyin ?? src.reading ?? ''),
        pos: src.pos,
        definition: String(w.definition ?? ''),
        meaningKr: String(w.meaningKr ?? ''),
        exampleZh: String(w.exampleZh ?? ''),
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
