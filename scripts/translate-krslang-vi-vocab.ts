/**
 * 한국 Gen-Z / MZ 슬랭 100을 베트남어 뜻 + 로마자 + 캐주얼 한국어 예문 + 베트남어 번역으로 enrich.
 * 방향: ko → vi (베트남어권 학습자·K컬처 팬 대상).
 *
 * integrate-vocab.ts 의 일반 분기(ko→en 특수 분기 아님)로 통합되므로,
 * 여기서 앱 공통 슬롯(meaningKr/phonetic/exampleEn/exampleKr)에 직접 채워 보낸다
 * (KO→KO 맞춤법 덱과 동일 방식). 슬롯명은 레거시지만 내용은 방향에 맞게:
 *   - meaningKr 슬롯 = 베트남어 뜻 (카드 뒷면)
 *   - phonetic    = 로마자
 *   - exampleEn 슬롯 = 한국어 예문 (원어, sourceLanguage=ko 로 TTS)
 *   - exampleKr 슬롯 = 베트남어 번역
 *
 * 입력: scripts/krslang-source.json ({rank, term, pos, category, hint}) — krslang 덱과 공용
 * 출력: scripts/krslang-vi-translated.json
 * 진행 파일: scripts/.krslang-vi-progress.json (중단 후 재실행 가능)
 *
 * 실행: npx ts-node scripts/translate-krslang-vi-vocab.ts
 * 옵션:
 *   --limit=N     상위 N개만 처리 (smoke test용)
 *   --model=NAME  모델 지정 (기본값·주의사항은 scripts/_shared/model.ts)
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
const SOURCE_PATH = path.resolve(process.cwd(), 'scripts/krslang-source.json');
const OUTPUT_PATH = path.resolve(process.cwd(), 'scripts/krslang-vi-translated.json');
const PROGRESS_PATH = path.resolve(process.cwd(), 'scripts/.krslang-vi-progress.json');

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
  pos: string;
  phonetic: string;    // 로마자 → integrate 일반 분기에서 phonetic 슬롯
  definition: string;  // 베트남어 뜻
  meaningKr: string;   // 공통 슬롯 = 베트남어 뜻 (카드 뒷면)
  exampleEn: string;   // 공통 슬롯 = 한국어 예문 (원어, ko TTS)
  exampleKr: string;   // 공통 슬롯 = 베트남어 번역
  category: string;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function translateBatch(batch: SourceEntry[], retry = 0): Promise<TranslatedEntry[]> {
  const inputJson = JSON.stringify(
    batch.map(e => ({ term: e.term, hintPos: e.pos, context: e.hint })),
    null, 0,
  );

  const prompt = `You are an expert tutor explaining Korean Gen-Z / MZ-generation slang to Vietnamese-speaking learners and K-culture fans.

Each input item is a word, phrase, or initialism used in current Korean youth slang — online, texting, and everyday casual speech. Many are recent neologisms, abbreviations (줄임말), or consonant-initialisms (초성, e.g. ㅇㅈ, ㄱㄱ). The "context" field gives an English gloss to pin down the slang meaning. Trust the context.

Input:
${inputJson}

Return ONLY a JSON array (no markdown, no explanation) with EXACTLY ${batch.length} items in the SAME ORDER.
Each item:
{
  "term": "<copy from input exactly, including Hangul or consonant letters>",
  "pos": "noun | verb | adjective | adverb | phrase | interjection | prefix",
  "meaningVi": "Clear Vietnamese meaning in casual terms. Use the equivalent Vietnamese youth slang when one exists. 1-2 senses, written in natural Vietnamese with proper diacritics.",
  "romaja": "Revised Romanization of how the term is actually said aloud. For consonant-initialisms, romanize the spoken full word (e.g. ㅇㅈ -> \\"injeong\\", ㄱㄱ -> \\"gogo\\", ㅇㅋ -> \\"okei\\").",
  "exampleKo": "A natural, casual Korean sentence as a real Korean MZ person would text or say it, actually using the term. Friendly modern register (반말 or 해요체, real chat tone). 8-18 words, Hangul (and the term's letters) only.",
  "exampleVi": "Natural, casual Vietnamese translation of exampleKo (how a Vietnamese-speaking peer would actually say it), with proper diacritics."
}

Rules:
- Return EXACTLY ${batch.length} items, same order as input.
- Do NOT change the term field — copy exactly.
- Keep everything SFW and friendly: no profanity, no sexual, drug, violent, or discriminatory content. Use only the clean, fun everyday sense of each term.
- The Korean example (exampleKo) must also avoid profanity-derived slang: do NOT use 존-/존나 forms (e.g. 존잘, 존맛, 존좋), 시발/씨- forms, or any vulgar words. Use clean casual forms instead (잘생겼어, 맛있어, 진짜 좋아).
- The Vietnamese output (meaningVi and exampleVi) must avoid vulgar/profane words; keep a casual but clean tone, and ALWAYS use correct Vietnamese diacritics (never ASCII-only Vietnamese).
- The example MUST actually use the term and sound like real casual chat, not a stiff textbook sentence.
- meaningVi must reflect the slang sense from "context", never an unrelated literal dictionary meaning.
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
      const meaningVi = String(w.meaningVi ?? '');
      return {
        rank: src.rank,
        term: src.term,
        pos: String(w.pos ?? src.pos),
        phonetic: String(w.romaja ?? ''),
        definition: meaningVi,
        meaningKr: meaningVi,                 // 공통 슬롯 = 베트남어 뜻
        exampleEn: String(w.exampleKo ?? ''), // 공통 슬롯 = 한국어 예문 (ko TTS)
        exampleKr: String(w.exampleVi ?? ''), // 공통 슬롯 = 베트남어 번역
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
