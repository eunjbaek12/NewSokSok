/**
 * TOPIK I(1~2급) 주제별 필수 어휘 350을 영어 뜻 + 로마자 + 초급 예문 + 영어 번역으로 enrich.
 * 방향: ko → en (영어권 한국어 학습자). integrate-vocab.ts 의 ko→en 분기로 통합.
 *
 * 이 덱의 특수성: 초급 시험 대비 덱이라 예문의 난이도가 뜻만큼 중요하다. 표제어보다
 * 어려운 단어나 중급 문법이 예문에 섞이면 정작 그 단어를 배우려는 학습자가 문장을
 * 못 읽는다. 그래서 프롬프트가 문법 범위를 명시적으로 제한하고, 생성 후 예문 길이와
 * 금지 문법을 검사한다.
 *
 * 표제어는 TOPIK 공식 평가 기준의 주제 영역(자기소개·물건 사기·음식 주문·취미·날씨,
 * 2급의 전화/부탁·공공시설)에 맞춰 자체 선정했다. 공개된 어휘 목록을 옮긴 것이 아니다.
 *
 * 입력: scripts/topik1-source.json ({rank, term, pos, category, hint})
 * 출력: scripts/topik1-translated.json
 * 진행 파일: scripts/.topik1-progress.json (중단 후 재실행 가능)
 *
 * 실행: npx ts-node -P tsconfig.scripts.json scripts/translate-topik1-vocab.ts
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
const SOURCE_PATH = path.resolve(process.cwd(), 'scripts/topik1-source.json');
const OUTPUT_PATH = path.resolve(process.cwd(), 'scripts/topik1-translated.json');
const PROGRESS_PATH = path.resolve(process.cwd(), 'scripts/.topik1-progress.json');

const BATCH_SIZE = 25;
const BATCH_DELAY_MS = 5000;
const MEANING_MAX = 60;    // 상황 덱 실측(평균 20~33자, 최대 61자)에 맞춘 상한
const EXAMPLE_MAX = 30;    // 초급 예문은 짧아야 한다

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
    batch.map(e => ({ term: e.term, hintPos: e.pos, context: e.hint, topic: e.category })),
    null, 0,
  );

  const prompt = `You are an expert teacher preparing English-speaking beginners for TOPIK I (levels 1-2), the elementary Korean proficiency test.

Each input word belongs to one of the topic areas TOPIK I covers: introducing yourself, family, shopping, ordering food, hobbies, weather, daily routine, transport and directions, public facilities (post office, bank), and phone calls, requests and appointments. The "context" field gives the English sense and any cultural note or homonym warning. Trust it.

Input:
${inputJson}

Return ONLY a JSON array (no markdown, no explanation) with EXACTLY ${batch.length} items in the SAME ORDER.
Each item:
{
  "term": "<copy from input exactly, Hangul>",
  "pos": "noun | verb | adjective | phrase",
  "meaningEn": "Plain English meaning, UNDER ${MEANING_MAX} CHARACTERS. Usually just the equivalent word or two. Add a short clarifier only when the context flags a homonym or a Korean-specific point (e.g. \\"salty (note: 짜다 also means to squeeze)\\"). This goes on a flashcard.",
  "romaja": "Revised Romanization of the term. e.g. \\"gukjeok\\", \\"baekhwajeom\\", \\"garatada\\"",
  "exampleKo": "ONE short sentence a TOPIK I candidate can actually read. ${EXAMPLE_MAX} characters or fewer, Hangul only.",
  "exampleEn": "Natural English translation of exampleKo."
}

The example sentence is the hard part. Follow these strictly:
- NEVER write 당신. Korean does not use a second-person pronoun the way English uses "you" — 당신 sounds like translationese or, to a stranger, hostile. This is the single most common mistake in Korean textbooks. To address someone, use their role (선생님, 사장님), their name + 씨, or simply drop the subject: "직업이 뭐예요?" not "당신의 직업은 무엇입니까?".
- Use 해요체 (-아요/어요/예요) as the default. -습니다/-입니다 only where it is genuinely natural (a formal self-introduction, an announcement) — do not let it creep into everyday sentences.
- Keep it to one clause, or two joined simply.
- ONLY beginner grammar: -이에요/예요, -아요/어요, -았어요/었어요, -고, -지만, -아서/어서, -(으)러 가요, -고 싶어요, -(으)ㄹ 거예요, -(으)세요, -지 마세요, -(으)ㄹ 수 있어요.
- BANNED as too advanced: -잖아요, -더라고요, -느라고, -더니, -는 바람에, -기 마련이다, long stacked relative clauses, and any 한자어 abstraction the learner would not know.
- NEVER use a word harder than the headword itself. A beginner must be able to read the entire sentence — if they need a dictionary for another word in it, the card has failed.
- Put the word in a concrete everyday situation so the meaning is visible from the sentence alone.

Other rules:
- Return EXACTLY ${batch.length} items, same order as input.
- Do NOT change the term field — copy exactly.
- exampleKo must contain the term (conjugated naturally for verbs and adjectives, e.g. 맵다 → 매워요).
- Keep everything clean and family-friendly.
${SHARED_PROMPT_RULES}
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
  reportFindings(collectFindings(results, { meaningMax: MEANING_MAX, exampleMax: EXAMPLE_MAX, beginnerGrammar: true }), results.length);
  if (fs.existsSync(PROGRESS_PATH)) { fs.unlinkSync(PROGRESS_PATH); console.log('진행 파일 정리됨'); }
}

main().catch(e => { console.error('치명적 오류:', e); process.exit(1); });
