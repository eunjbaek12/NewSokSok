/**
 * 상황별 한국어 생활 어휘(시장/등산/병원/편의점·배달) 50선을 영어 뜻 + 로마자 + 한국어 예문 + 영어 번역으로 enrich.
 * 방향: ko → en (영미권 한국어 학습자 대상). integrate-vocab.ts 의 ko→en 분기로 통합.
 *
 * 입력: scripts/<deck>-source.json ({rank, term, pos, category, hint})
 * 출력: scripts/<deck>-translated.json
 * 진행 파일: scripts/.<deck>-progress.json (중단 후 재실행 가능)
 *
 * 실행: npx ts-node -P tsconfig.scripts.json scripts/translate-situation-vocab.ts --deck=market
 *       (공용 검사 모듈을 상대 import 하므로 -P 옵션이 필요하다)
 * 옵션:
 *   --deck=market|hiking|clinic|convenience   (필수)
 *   --limit=N                     상위 N개만 처리 (smoke test용)
 *   --model=NAME                  모델 지정 (기본값·주의사항은 scripts/_shared/model.ts)
 */
import fs from 'fs';
import path from 'path';
import { collectFindings, reportFindings, SHARED_PROMPT_RULES } from './lib/ko-deck-checks';
import { resolveScriptModel } from './_shared/model';

interface DeckConfig {
  /** 프롬프트에 넣을 상황 설명 — 예문의 무대를 결정한다. */
  setting: string;
  /** 예문 화자·톤 지시. */
  voice: string;
}

const DECKS: Record<string, DeckConfig> = {
  market: {
    setting:
      'shopping at a Korean traditional market (재래시장) — open-air stalls selling produce, meat, fish, banchan and street food, where prices are negotiable and vendors call out to customers',
    voice:
      'a shopper talking to a vendor, or two shoppers talking to each other, at a market stall. Polite 해요체 to vendors; casual between friends.',
  },
  hiking: {
    setting:
      'hiking a Korean mountain (등산) — trails, summits, gear, trail etiquette, and the food and drink that go with it',
    voice:
      'a hiker on the trail talking with a hiking companion or greeting another hiker. Friendly 해요체, the way Korean hikers actually speak on a mountain.',
  },
  convenience: {
    setting:
      'a Korean convenience store (편의점) and ordering food on a delivery app — the checkout and its bag/points/receipt questions, the hot-food case and the free microwave and hot-water dispenser, then ordering on a 배달앱 and receiving it at the door',
    voice:
      'a customer and the part-time clerk talking across the counter, in polite 해요체 both ways. For the delivery-app items, write the way Koreans actually type into the request box instead — short, clipped, imperative (문 앞에 두고 벨 눌러 주세요) — or a customer speaking to the driver.',
  },
  clinic: {
    setting:
      'going to a Korean neighborhood clinic (내과/이비인후과) with a cold — checking in, describing symptoms to the doctor, being examined, then filling the prescription at the pharmacy',
    voice:
      'a patient describing symptoms, or the doctor / receptionist / pharmacist speaking to the patient. Polite 해요체/합쇼체 as actually used in a clinic.',
  },
};

const deckArg = process.argv.find(a => a.startsWith('--deck='));
const DECK = deckArg ? deckArg.split('=')[1] : '';
if (!DECKS[DECK]) {
  console.error(`❌ --deck= 필요. 가능한 값: ${Object.keys(DECKS).join(', ')}`);
  process.exit(1);
}
const CONFIG = DECKS[DECK];

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
const SOURCE_PATH = path.resolve(process.cwd(), `scripts/${DECK}-source.json`);
const OUTPUT_PATH = path.resolve(process.cwd(), `scripts/${DECK}-translated.json`);
const PROGRESS_PATH = path.resolve(process.cwd(), `scripts/.${DECK}-progress.json`);

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

  const prompt = `You are an expert Korean tutor writing a situational vocabulary deck for English-speaking learners of Korean.

Situation: ${CONFIG.setting}.

Each input item is a Korean word or phrase used in that situation. The "context" field gives an English gloss pinning down the sense we want. Trust the context.

Input:
${inputJson}

Return ONLY a JSON array (no markdown, no explanation) with EXACTLY ${batch.length} items in the SAME ORDER.
Each item:
{
  "term": "<copy from input exactly>",
  "pos": "noun | verb | adjective | adverb | phrase | interjection",
  "meaningEn": "The English meaning as a pocket dictionary would give it: a short noun/verb phrase, NOT a sentence. Under 60 characters. Use the everyday English equivalent when one exists (e.g. \\"a rip-off\\", \\"to haggle\\", \\"out of breath\\"). Give a second sense after a semicolon only if the first is genuinely ambiguous. If there is no English equivalent, give the shortest plain-English gloss that works — never a transliteration, never an encyclopedic explanation.",
  "romaja": "Revised Romanization of how the term is actually pronounced aloud (apply pronunciation rules, e.g. 국립공원 -> \\"gungnipgongwon\\"). For multi-word phrases, space the words the same way.",
  "exampleKo": "ONE natural Korean sentence — exactly one, never two — that would really be said in this exact situation, actually using the term. ${CONFIG.voice} 6-12 어절, 20-38 characters — long enough to carry the situation, short enough for a flashcard. Hangul only (numbers and units are fine).",
  "exampleEn": "Natural English translation of exampleKo — how an English speaker would actually say the same thing, not a word-for-word gloss."
}

Rules:
- Return EXACTLY ${batch.length} items, same order as input.
- Do NOT change the term field — copy exactly.
- The example MUST be set in the situation above. No generic textbook sentences that could be about anything.
- Keep it tight: these go on a flashcard. A long meaning or a two-sentence example is a failure, even if accurate.
- meaningEn must reflect the situational sense from "context", never an unrelated literal dictionary meaning.
${SHARED_PROMPT_RULES}
- Keep everything SFW, friendly and respectful. No profanity, no medical advice framed as instruction, no discriminatory content.
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
  console.log(`📚 [${DECK}] ${source.length}개 처리 (전체 ${all.length}개${LIMIT < all.length ? `, --limit=${LIMIT}` : ''}, model=${MODEL})`);

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
  reportFindings(collectFindings(results, { meaningMax: 70 }), results.length);
  if (fs.existsSync(PROGRESS_PATH)) { fs.unlinkSync(PROGRESS_PATH); console.log('진행 파일 정리됨'); }
}

main().catch(e => { console.error('치명적 오류:', e); process.exit(1); });
