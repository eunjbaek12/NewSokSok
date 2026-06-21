/**
 * 기초 한국어 500을 외국인 학습자용으로 ko→(zh|ja|vi) 번역.
 *
 * 기존 ko→en 산출물(scripts/ko-translated.json)을 재사용한다. 한국어 표제어(term)·
 * 로마자(romaja)·한국어 예문(exampleKo)은 en/zh/ja/vi 덱이 동일하게 공유하고,
 * 도착어 "뜻"과 "예문 번역"만 새로 생성한다. (일관성 + AI 호출 절감)
 *
 * 영어 뜻(meaningEn)을 disambiguation 힌트로 같이 넘겨 다의어 오역을 줄인다.
 *
 * 입력: scripts/ko-translated.json (translate-ko-vocab.ts 산출)
 * 출력: scripts/ko-<lang>-translated.json   (integrate-vocab.ts 일반 분기용 공통 슬롯)
 * 진행: scripts/.ko-<lang>-progress.json     (중단 후 동일 명령으로 재개)
 *
 * 실행: npx ts-node scripts/translate-ko-foreign-vocab.ts --lang=zh
 * 옵션: --limit=N  → 상위 N개만 (smoke test)
 */
import fs from 'fs';
import path from 'path';

type Lang = 'zh' | 'ja' | 'vi';

const langArg = process.argv.find(a => a.startsWith('--lang='));
const LANG = (langArg?.split('=')[1] ?? '') as Lang;
if (!['zh', 'ja', 'vi'].includes(LANG)) {
  console.error('❌ --lang=zh|ja|vi 를 지정하세요.');
  process.exit(1);
}

const limitArg = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : Infinity;

// flash와 flash-lite는 별도 RPD 버킷 — flash 소진 시 --model=lite로 같은 날 이어감.
const modelArg = process.argv.find(a => a.startsWith('--model='));
const MODEL = (modelArg?.split('=')[1] === 'lite') ? 'gemini-2.5-flash-lite' : 'gemini-2.5-flash';

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
const SOURCE_PATH = path.resolve(process.cwd(), 'scripts/ko-translated.json');
const OUTPUT_PATH = path.resolve(process.cwd(), `scripts/ko-${LANG}-translated.json`);
const PROGRESS_PATH = path.resolve(process.cwd(), `scripts/.ko-${LANG}-progress.json`);

const BATCH_SIZE = 25;
const BATCH_DELAY_MS = 5000;

// 도착어별 프롬프트 조각: 언어 이름 + 뜻/예문 필드 작성 지침.
const LANG_SPEC: Record<Lang, { name: string; learner: string; meaningRule: string; exampleRule: string }> = {
  zh: {
    name: 'Simplified Chinese',
    learner: 'Chinese-speaking (Mandarin) beginners learning Korean',
    meaningRule: 'Natural Simplified Chinese meaning (1-3 senses, comma-separated). Use Mandarin as written in mainland China.',
    exampleRule: 'Natural Simplified Chinese translation of the Korean example.',
  },
  ja: {
    name: 'Japanese',
    learner: 'Japanese-speaking beginners learning Korean',
    meaningRule: 'Natural Japanese meaning (1-3 senses, 「、」 or comma-separated). Use standard Japanese (です/ます register is not required for the gloss).',
    exampleRule: 'Natural Japanese translation of the Korean example.',
  },
  vi: {
    name: 'Vietnamese',
    learner: 'Vietnamese-speaking beginners learning Korean',
    meaningRule: 'Natural Vietnamese meaning (1-3 senses, comma-separated). ALWAYS use correct Vietnamese diacritics (never ASCII-only).',
    exampleRule: 'Natural Vietnamese translation of the Korean example, with correct diacritics.',
  },
};

interface KoEntry {
  rank: number;
  term: string;
  pos: string;
  grade: string;
  meaningEn: string;
  romaja: string;
  exampleKo: string;
  exampleEn: string;
  category: string;
}

// integrate-vocab.ts 일반 분기가 읽는 공통 슬롯으로 바로 출력한다.
interface TranslatedEntry {
  rank: number;
  term: string;
  pos: string;
  grade: string;
  phonetic: string;    // 로마자 → phonetic 슬롯
  definition: string;  // 도착어 뜻
  meaningKr: string;   // 공통 슬롯(카드 뒷면) = 도착어 뜻
  exampleEn: string;   // 공통 슬롯 = 한국어 예문 (원어, ko TTS)
  exampleKr: string;   // 공통 슬롯 = 도착어 예문 번역
  category: string;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function translateBatch(batch: KoEntry[], retry = 0): Promise<TranslatedEntry[]> {
  const spec = LANG_SPEC[LANG];
  const inputJson = JSON.stringify(
    batch.map(e => ({ term: e.term, hintPos: e.pos, enMeaning: e.meaningEn, exampleKo: e.exampleKo })),
    null, 0,
  );

  const prompt = `You are an expert Korean vocabulary tutor for ${spec.learner}.

For each Korean word, provide a meaning in ${spec.name} and a ${spec.name} translation of the given Korean example sentence. The "enMeaning" field is the English gloss — use it to pick the correct sense, but write the output in ${spec.name}. The "exampleKo" is a fixed Korean example you must translate (do NOT rewrite or invent a new Korean sentence).

Input:
${inputJson}

Return ONLY a JSON array (no markdown, no explanation) with EXACTLY ${batch.length} items in the SAME ORDER.
Each item:
{
  "term": "<copy from input exactly, Hangul>",
  "meaning": "${spec.meaningRule}",
  "example": "${spec.exampleRule}"
}

Rules:
- Return EXACTLY ${batch.length} items, same order as input.
- Do NOT change the term field — copy exactly.
- "meaning" must match the sense given by enMeaning, not an unrelated dictionary sense.
- "example" must be a faithful, natural translation of exactly the provided exampleKo.
- Keep everything clean and learner-friendly (TOPIK 1-2 level).
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
      const meaning = String(w.meaning ?? '').trim();
      return {
        rank: src.rank,
        term: src.term,
        pos: src.pos,
        grade: src.grade,
        phonetic: src.romaja,
        definition: meaning,
        meaningKr: meaning,
        exampleEn: src.exampleKo,
        exampleKr: String(w.example ?? '').trim(),
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
    console.error(`❌ 소스 없음: ${SOURCE_PATH}. translate-ko-vocab.ts 먼저 실행.`);
    process.exit(1);
  }
  const all: KoEntry[] = JSON.parse(fs.readFileSync(SOURCE_PATH, 'utf8'));
  const source = all.slice(0, Math.min(LIMIT, all.length));
  console.log(`📚 [ko→${LANG}] (${MODEL}) ${source.length}개 단어 처리 (전체 ${all.length}개${LIMIT < all.length ? `, --limit=${LIMIT}` : ''})`);

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
