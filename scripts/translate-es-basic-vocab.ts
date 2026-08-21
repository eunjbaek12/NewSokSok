/**
 * 스페인어 기초 단어를 한국어 뜻 + 한글 발음 + 스페인어 예문 + 한국어 번역으로 enrich.
 * 방향: es → ko (한국인 스페인어 기초 학습자 대상).
 *
 * integrate-vocab.ts 의 일반 분기로 통합되므로, 앱 공통 슬롯에 직접 채워 보낸다:
 *   - meaningKr 슬롯 = 한국어 뜻 (카드 뒷면)
 *   - phonetic    = 한글 발음 (스페인어가 한국인에게 직관적이지 않아 발음 가이드 제공)
 *   - exampleEn 슬롯 = 스페인어 예문 (원어, sourceLanguage=es 로 TTS)
 *   - exampleKr 슬롯 = 한국어 번역
 *   - definition  = 영어 정의
 *
 * 입력: scripts/es-basic-source.json ({rank, term, pos, category, hint}) — 직접 큐레이션
 * 출력: scripts/es-basic-translated.json
 * 진행 파일: scripts/.es-basic-progress.json (중단 후 재실행 가능)
 *
 * 실행: npx ts-node scripts/translate-es-basic-vocab.ts
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
const SOURCE_PATH = path.resolve(process.cwd(), 'scripts/es-basic-source.json');
const OUTPUT_PATH = path.resolve(process.cwd(), 'scripts/es-basic-translated.json');
const PROGRESS_PATH = path.resolve(process.cwd(), 'scripts/.es-basic-progress.json');

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
  definition: string;  // 영어 정의
  phonetic: string;    // 한글 발음 → integrate 일반 분기에서 phonetic 슬롯
  meaningKr: string;   // 공통 슬롯 = 한국어 뜻
  exampleEn: string;   // 공통 슬롯 = 스페인어 예문 (원어, es TTS)
  exampleKr: string;   // 공통 슬롯 = 한국어 번역
  category: string;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function translateBatch(batch: SourceEntry[], retry = 0): Promise<TranslatedEntry[]> {
  const inputJson = JSON.stringify(
    batch.map(e => ({ term: e.term, hintPos: e.pos, context: e.hint })),
    null, 0,
  );

  const prompt = `You are an expert Spanish vocabulary tutor for Korean beginners (A1-A2 level).

For each Spanish term, the "context" field gives an English gloss to pin down the intended basic meaning — trust it (e.g. "pescado" = fish as food, "ser" vs "estar" distinction).

Input:
${inputJson}

Return ONLY a JSON array (no markdown, no explanation) with EXACTLY ${batch.length} items in the SAME ORDER.
Each item:
{
  "term": "<copy from input exactly, with Spanish accents>",
  "pos": "noun | verb | adjective | adverb | number | pronoun | preposition | conjunction | interjection | phrase",
  "definition": "A simple English definition (short, 1 phrase).",
  "meaningKr": "Natural Korean meaning (1-3 senses, comma-separated). 예: \\"집, 가정\\"",
  "pronKo": "Korean Hangul transcription of the Spanish pronunciation, as a Korean beginner would read it aloud (Castilian/Latin-American neutral). 예: hola->\\"올라\\", gracias->\\"그라시아스\\", jueves->\\"후에베스\\", año-> N/A. Reflect Spanish sounds: j/g(e,i)->ㅎ, ll/y->ㅇㅑ/ㅈ, ñ->니/뇨, v->ㅂ, z/c(e,i)->ㅅ, h is silent.",
  "exampleEs": "A natural, very simple Spanish sentence (A1-A2, 4-9 words) that actually USES the term, with correct accents.",
  "exampleKr": "Natural Korean translation of exampleEs."
}

Rules:
- Return EXACTLY ${batch.length} items, same order as input.
- Do NOT change the term field — copy exactly (keep accents like á, é, í, ó, ú, ñ).
- Korean must be natural and idiomatic, not literal.
- The example MUST use the term and be A1-A2 difficulty (basic grammar/vocabulary).
- Keep everything clean and SFW (no profanity, no sensitive content) — this is a beginner deck for students.
- ALWAYS keep correct Spanish accents/diacritics in term and exampleEs.
- Return ONLY the JSON array.`;

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.6, responseMimeType: 'application/json' },
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
        definition: String(w.definition ?? ''),
        phonetic: String(w.pronKo ?? ''),
        meaningKr: String(w.meaningKr ?? ''),
        exampleEn: String(w.exampleEs ?? ''),
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
