/**
 * 영어 테마 덱(en → ko) 공용 생성기 — 표제어 목록을 한국어 뜻 + 한글 발음 + 영어 예문 +
 * 한국어 번역으로 채운다. `translate-situation-vocab.ts` 의 en→ko 짝이다.
 *
 * 왜 공용인가: 이 방향의 덱은 그동안 덱마다 스크립트를 복제해 왔다(mzslang · zhslang · krteen).
 * 프롬프트에서 덱마다 다른 건 **주제와 예문의 화자**뿐이라, ko→en 쪽에서 이미 한 것처럼
 * DECKS 맵에 두 줄만 더하면 되게 했다. 기존 세 스크립트는 산출물이 이미 커밋돼 있어 두었다.
 *
 * 입력: scripts/<deck>-source.json ({rank, term, pos, category, hint})
 * 출력: scripts/<deck>-translated.json
 * 진행 파일: scripts/.<deck>-progress.json (중단 후 재실행 가능)
 *
 * 실행: npx ts-node -P tsconfig.scripts.json scripts/translate-en-theme-vocab.ts --deck=halloween
 *       (공용 검사 모듈을 상대 import 하므로 -P 옵션이 필요하다)
 * 옵션:
 *   --deck=halloween   (필수)
 *   --limit=N          상위 N개만 (smoke test)
 *   --model=NAME       모델 지정 (기본값·주의사항은 scripts/_shared/model.ts)
 */
import fs from 'fs';
import path from 'path';
import { collectFindings, reportFindings, SHARED_PROMPT_RULES } from './lib/ko-deck-checks';
import { resolveScriptModel } from './_shared/model';

interface DeckConfig {
  /** 프롬프트에 넣을 주제 설명 — 예문의 무대를 정한다. */
  subject: string;
  /** 예문 화자·톤 지시. */
  voice: string;
}

const DECKS: Record<string, DeckConfig> = {
  halloween: {
    subject:
      'Halloween in the English-speaking world — trick-or-treating and costumes, the monsters and witches of the season, haunted houses and horror films, and the everyday English for being scared',
    voice:
      'a friendly, everyday sentence someone would really say or text in late October — a parent about their kids, friends planning a costume, someone reacting to a scary film. 8-16 words. Keep it warm and fun, never gruesome.',
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

  const prompt = `You are an expert English tutor writing a themed vocabulary deck for Korean learners of English.

Theme: ${CONFIG.subject}.

Each input item is an English word or phrase from that theme. The "context" field gives the sense we want. Trust the context.

Input:
${inputJson}

Return ONLY a JSON array (no markdown, no explanation) with EXACTLY ${batch.length} items in the SAME ORDER.
Each item:
{
  "term": "<copy from input exactly>",
  "phonetic": "Simple pronunciation guide a Korean reader can follow, written in Hangul (not IPA). e.g. \"잭오랜턴\", \"코스튬\". Keep it short.",
  "pos": "noun | verb | adjective | adverb | phrase | interjection",
  "meaningKr": "The Korean meaning as a pocket dictionary would give it — a short noun/verb phrase, NOT a sentence. Under 40 characters. Use the everyday Korean equivalent when one exists (호박등, 마녀, 소름). Add a second sense after a comma only if the first is genuinely ambiguous. For culture-specific things with no Korean word, give the shortest plain gloss that works, never a transliteration alone.",
  "exampleEn": "${CONFIG.voice} It MUST actually use the term, conjugated naturally.",
  "exampleKr": "Natural Korean translation of exampleEn — how a Korean would really say the same thing, not a word-for-word gloss."
}

Rules:
- Return EXACTLY ${batch.length} items, same order as input.
- Do NOT change the term field — copy exactly.
- Keep it tight: these go on a flashcard. A long meaning or a two-sentence example is a failure, even if accurate.
- meaningKr must reflect the sense from "context", never an unrelated literal dictionary meaning.
${SHARED_PROMPT_RULES}
- Keep everything SFW and friendly: no gore, no injury, no real disasters, nothing about suicide or self-harm, no mocking of any religion. Halloween here is costumes and fun, not horror in the graphic sense.
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
  // 생성 직후 같은 그물을 건다. 방향이 반대라 슬롯이 뒤집힌다 — 여기서 한국어 문장은
  // exampleKr(번역문)이고, 표제어가 영어라 로마자는 검사 대상이 아니다.
  // (diagnose-ko-decks.ts 가 통합 뒤에 하는 매핑과 같다.)
  reportFindings(collectFindings(results.map(w => ({
    term: w.term,
    meaningEn: w.meaningKr,
    exampleKo: w.exampleKr,
    exampleEn: w.exampleEn,
  })), { meaningMax: 60, skipRomaja: true, koreanIsTranslation: true }), results.length);
  if (fs.existsSync(PROGRESS_PATH)) { fs.unlinkSync(PROGRESS_PATH); console.log('진행 파일 정리됨'); }
}

main().catch(e => { console.error('치명적 오류:', e); process.exit(1); });
