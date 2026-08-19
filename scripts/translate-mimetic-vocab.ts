/**
 * 한국어 의성어·의태어 100을 영어 뜻 + 로마자 + 현대 구어체 예문 + 영어 번역으로 enrich.
 * 방향: ko → en (영어권 한국어 학습자 대상). integrate-vocab.ts 의 ko→en 분기로 통합.
 *
 * 이 덱의 특수성: 의성어·의태어는 짝을 이루는 동사(반짝반짝 빛나다, 깜짝 놀라다,
 * 후루룩 먹다) 없이는 쓸 수 없다. 그래서 예문이 뜻풀이보다 중요하고, 프롬프트가
 * collocation을 강제한다. 생성 후 표제어가 예문에 실제로 들어갔는지 검사해 경고한다.
 *
 * 입력: scripts/mimetic-source.json ({rank, term, pos, category, hint})
 * 출력: scripts/mimetic-translated.json
 * 진행 파일: scripts/.mimetic-progress.json (중단 후 재실행 가능)
 *
 * 실행: npx ts-node -P tsconfig.scripts.json scripts/translate-mimetic-vocab.ts
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
const SOURCE_PATH = path.resolve(process.cwd(), 'scripts/mimetic-source.json');
const OUTPUT_PATH = path.resolve(process.cwd(), 'scripts/mimetic-translated.json');
const PROGRESS_PATH = path.resolve(process.cwd(), 'scripts/.mimetic-progress.json');

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

  const prompt = `You are an expert tutor of Korean 의성어/의태어 (onomatopoeia and mimetic words) for English-speaking learners of Korean.

Each input item is a Korean sound word (의성어, imitating a SOUND) or mimetic word (의태어, depicting a MANNER, shape, motion or feeling). The "context" field tells you which type it is, the English sense, and the verb form or collocation it normally appears with. Trust the context completely.

These words are the hardest part of Korean for English speakers because English has no equivalent word class. The learner needs three things from you: what it depicts, which verb it pairs with, and one sentence that sounds like a real Korean actually said it.

Input:
${inputJson}

Return ONLY a JSON array (no markdown, no explanation) with EXACTLY ${batch.length} items in the SAME ORDER.
Each item:
{
  "term": "<copy from input exactly, Hangul>",
  "pos": "adverb | interjection",
  "meaningEn": "Start with the type marker \\"(sound)\\" for 의성어 or \\"(manner)\\" for 의태어, then the English meaning, then the verb it pairs with. e.g. \\"(manner) twinkling, sparkling — of small lights; pairs with 빛나다. verb form 반짝이다\\", \\"(sound) slurping noodles or soup in one go\\". Keep under 140 characters. If the context contains a WARNING or NOTE about misuse or a homonym, fold that in — it is the most valuable part for the learner.",
  "romaja": "Revised Romanization, hyphenating the repeated halves. e.g. \\"banjjak-banjjak\\", \\"dugeun-dugeun\\", \\"hururuk\\", \\"kkam-jjak\\"",
  "exampleKo": "One natural sentence in modern spoken Korean that USES the term the way a native actually says it. Everyday register — 해요체 or 반말 as a friend would actually say it, not textbook 합니다체. 8-16 words, Hangul only. Make the situation concrete (a specific place, food, person) so the word's feel is obvious.",
  "exampleEn": "Natural English translation of exampleKo. Render the mimetic naturally in English rather than word-for-word — if English has no equivalent, convey the feel with an adverb or an image."
}

Rules:
- Return EXACTLY ${batch.length} items, same order as input.
- Do NOT change the term field — copy exactly.
- exampleKo MUST contain the term itself (or its stated adjective form, e.g. 촉촉 → 촉촉한). A sentence that merely mentions the concept is useless.
- CRITICAL: never follow the mimetic with a verb built from its own root. 번쩍번쩍 번쩍였어, 깜빡깜빡 깜빡거려요, 두근두근 두근거려 are all WRONG Korean — no native says the root twice. The verb form given in the context is an ALTERNATIVE wording, never a partner. Write either the mimetic + a DIFFERENT verb (반짝반짝 빛나다, 살금살금 걷다, 후루룩 먹다, 깜짝 놀라다), or the mimetic + 하다 (알록달록해요, 깜빡깜빡해요) — whichever a native would actually say.
- Equally wrong: attaching -거리다/-대다 to an ALREADY DOUBLED form. 깜빡깜빡 거리다, 두리번두리번 거렸어, 웅성웅성거리고, 부스럭부스럭 거리는 are all incorrect — the doubling already carries the repetition. Use 깜빡깜빡하다 / 웅성웅성하다 (with 하다, written as one word), or drop the doubling and say 깜빡거리다 / 웅성거리다. Never both.
- Use the term in the EXACT form given as "term". If the term is single (꿀꺽, 깜짝), do not silently double it (꿀꺽꿀꺽) in the example — the card teaches the form on its front.
- Never define the word with the word. meaningEn must be plain English a beginner can read.
- Keep every example clean and family-friendly.
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
  reportFindings(collectFindings(results, { meaningMax: 140, mimeticEcho: true }), results.length);
  if (fs.existsSync(PROGRESS_PATH)) { fs.unlinkSync(PROGRESS_PATH); console.log('진행 파일 정리됨'); }
}

main().catch(e => { console.error('치명적 오류:', e); process.exit(1); });
