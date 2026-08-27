/**
 * 중국어 중급(HSK 3급) 단어를 Gemini로 한국어 뜻·예문으로 enrich.
 *
 * 입력: scripts/zh-intermediate-source.json (build-zh-hsk-source.ts 3 산출)
 * 출력: scripts/zh-intermediate-translated.json
 * 진행 파일: scripts/.zh-intermediate-progress.json (중단 후 재실행 가능)
 *
 * 실행: npx ts-node scripts/translate-zh-intermediate-vocab.ts
 * 옵션:
 *   --limit=N     상위 N개만 처리 (smoke test용)
 *   --repair      기존 결과에서 결함 항목만 다시 뽑는다 (전량 재실행 대신)
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
const SOURCE_PATH = path.resolve(process.cwd(), 'scripts/zh-intermediate-source.json');
const OUTPUT_PATH = path.resolve(process.cwd(), 'scripts/zh-intermediate-translated.json');
const PROGRESS_PATH = path.resolve(process.cwd(), 'scripts/.zh-intermediate-progress.json');

const BATCH_SIZE = 25;
const BATCH_DELAY_MS = 5000;

interface SourceEntry {
  rank: number;
  term: string;
  traditional: string;
  reading: string;
  pos: string;
  definition: string;
  category: string;
}

interface TranslatedEntry {
  rank: number;
  term: string;
  traditional: string;
  reading: string;
  pos: string;
  definition: string;
  meaningKr: string;
  exampleZh: string;
  exampleKr: string;
  category: string;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const HAN_RE = /[一-鿿]/;
const HANGUL_RE = /[가-힣]/;
const LATIN_RE = /[A-Za-z]/;

/**
 * exampleZh 가 중국어가 아닌 것을 잡는다.
 *
 * 2026-08-25 첫 배치 시험에서 5급 25장 중 1장(版)이 exampleZh 자리에 **한국어 문장**을
 * 넣고 exampleKr 을 비웠다. 파싱은 성공하므로 JSON 검사로는 안 잡힌다.
 * 🔑 판정은 저장된 언어 코드가 아니라 **문자 체계**로 한다(lib/example-blank.ts 와 같은 이유).
 *
 * 🔴 **라틴 문자를 빠뜨렸다가 969장에서 3건을 놓칠 뻔했다**(같은 날, 3급 전량):
 *   我们要保护 Environment. (我们要保护自然环境)   ← 영어 + 괄호 안 자기 정정
 *   夜市里有很多 traditional 的地方美食。
 *   他的手指不小心被纸kè伤了。                      ← 한자 대신 병음
 * "한자가 있고 한글이 없으면 통과"로 짜면 이것들이 전부 빠져나간다. 🔑 **있어야 할 문자만
 * 보지 말고 있으면 안 되는 문자도 볼 것.**
 *
 * ⚠️ exampleKr 에는 라틴을 걸지 않는다 — "QR코드", "TV 프로그램" 처럼 한국어에서 정상이다
 *    (같은 배치에 4건 있었고 전부 멀쩡했다).
 */
function langDefects(items: TranslatedEntry[]): string[] {
  return items
    .filter(w =>
      !HAN_RE.test(w.exampleZh)
      || HANGUL_RE.test(w.exampleZh)
      || LATIN_RE.test(w.exampleZh)
      || !w.exampleKr.trim())
    .map(w => w.term);
}

async function translateBatch(batch: SourceEntry[], retry = 0, langRetry = 0): Promise<TranslatedEntry[]> {
  const inputJson = JSON.stringify(
    batch.map(e => ({ term: e.term, pinyin: e.reading, pos: e.pos, hintEn: e.definition })),
    null, 0,
  );

  const prompt = `You are an expert Mandarin Chinese vocabulary tutor for Korean intermediate learners.

For each Chinese entry (simplified characters), provide the Korean meaning and a natural HSK 3-level Chinese example sentence with its Korean translation.

Input:
${inputJson}

The "hintEn" field is a rough English gloss from CC-CEDICT — it may show a secondary or surname sense. Judge the MOST USEFUL learner-facing meaning of the word.

Return ONLY a JSON array (no markdown, no explanation) with EXACTLY ${batch.length} items in the SAME ORDER.
Each item:
{
  "term": "<copy from input exactly, simplified>",
  "meaningKr": "Korean meaning (1-3 senses, comma-separated). 예: \\"결정하다, 정하다\\"",
  "exampleZh": "Natural intermediate Chinese sentence (8-16 characters) in simplified characters using the term. HSK 3 grammar (e.g. 把/被 construction, 着/了/过 aspects, 比 comparisons, resultative complements, 一边…一边…).",
  "exampleKr": "Natural Korean translation of exampleZh."
}

Rules:
- Return EXACTLY ${batch.length} items, same order as input.
- Do NOT change the term field — copy exactly.
- Korean must be natural and idiomatic.
- Korean examples: DROP the second-person pronoun (당신/너) unless the pronoun itself is what the sentence teaches. Korean omits subjects naturally — write 「무슨 띠예요?」, not 「당신은 무슨 띠입니까?」.
- Example must be HSK 3 difficulty (intermediate vocabulary, common grammar patterns), simplified characters only.
- Topics should fit intermediate contexts: daily life, school, work, travel, hobbies, simple opinions.
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
        return translateBatch(batch, retry + 1, langRetry);
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

    const mapped = batch.map((src, i) => {
      const w = parsed[i] ?? {};
      return {
        rank: src.rank,
        term: src.term,
        traditional: src.traditional,
        reading: src.reading,
        pos: src.pos,
        definition: src.definition,
        meaningKr: String(w.meaningKr ?? ''),
        exampleZh: String(w.exampleZh ?? ''),
        exampleKr: String(w.exampleKr ?? ''),
        category: src.category,
      };
    });

    // 언어 이탈은 배치째로 다시 부른다 — 한 항목만 재요청하는 경로가 없고, 배치 한 번이 ₩3 이다.
    const bad = langDefects(mapped);
    if (bad.length && langRetry < 3) {
      console.log(`  ⚠️ exampleZh 가 중국어가 아님 ${bad.length}건(${bad.join(' ')}) — 배치 재시도 (${langRetry + 1}/3)`);
      await sleep(2000);
      return translateBatch(batch, retry, langRetry + 1);
    }
    if (bad.length) console.log(`  🔴 재시도 3회 후에도 남음: ${bad.join(' ')} — 통합 전에 손으로 볼 것`);

    return mapped;
  } catch (e: any) {
    if (retry < 2) {
      console.log(`  ⚠️ ${e.message}, 5초 후 재시도...`);
      await sleep(5000);
      return translateBatch(batch, retry + 1, langRetry);
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

const REPAIR_MODE = process.argv.includes('--repair');
const termsArg = process.argv.find(a => a.startsWith('--terms='));
const TERMS = termsArg ? termsArg.split('=')[1].split(',').map(t => t.trim()).filter(Boolean) : [];

async function main() {
  if (REPAIR_MODE || TERMS.length) return repair();

  if (!fs.existsSync(SOURCE_PATH)) {
    console.error(`❌ 소스 없음: ${SOURCE_PATH}. build-zh-hsk-source.ts 3 먼저 실행.`);
    process.exit(1);
  }
  const all: SourceEntry[] = JSON.parse(fs.readFileSync(SOURCE_PATH, 'utf8'));
  const source = all.slice(0, Math.min(LIMIT, all.length));
  console.log(`📚 ${source.length}개 단어 처리 (전체 ${all.length}개${LIMIT < all.length ? `, --limit=${LIMIT}` : ''}, model=${MODEL})`);

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

/**
 * --repair : 이미 만들어 둔 결과에서 결함 항목만 골라 다시 뽑는다.
 *
 * 왜 전량 재실행이 아닌가 — 2026-08-25 에 3급 969장 중 결함이 3건(0.3%)이었다. 그 3건
 * 때문에 969장을 다시 돌리면 10분과 돈을 쓰고도 **temperature 0.7 이라 새 결함이 생길 수
 * 있다.** 반대로 사람이 손으로 고치는 것은 더 나쁘다 — 중국어 예문을 내가 지어내는 셈이다.
 *
 * 🔑 프롬프트를 복제하지 않으려고 별도 스크립트가 아니라 같은 파일에 뒀다. 이 저장소는
 *    같은 문자열이 두 곳에 갈라져 조용히 어긋난 전례가 여럿이다(PHONETIC_INSTRUCTION 4곳,
 *    모델명 3곳).
 */
async function repair() {
  if (!fs.existsSync(OUTPUT_PATH)) {
    console.error(`❌ 결과 파일이 없습니다: ${OUTPUT_PATH}`);
    process.exit(1);
  }
  const all: TranslatedEntry[] = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'));
  const source: SourceEntry[] = JSON.parse(fs.readFileSync(SOURCE_PATH, 'utf8'));

  // 검사기가 잡는 결함 + 손으로 지목한 표제어(--terms). 후자는 검수 도구가 "확인 필요"로
  // 분류한 것들처럼 규칙으로는 못 거르지만 사람이 고치기로 정한 자리다.
  const badTerms = new Set([...langDefects(all), ...TERMS]);
  if (badTerms.size === 0) {
    console.log(`✅ ${all.length}장 전수 검사 — 고칠 것 없음`);
    return;
  }
  console.log(`🔧 ${all.length}장 중 ${badTerms.size}건 재생성: ${[...badTerms].join(' ')}`);

  const targets = source.filter(s => badTerms.has(s.term));
  const fixed: TranslatedEntry[] = [];
  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    fixed.push(...await translateBatch(targets.slice(i, i + BATCH_SIZE)));
    if (i + BATCH_SIZE < targets.length) await sleep(BATCH_DELAY_MS);
  }

  const byTerm = new Map(fixed.map(f => [f.term, f]));
  const merged = all.map(w => byTerm.get(w.term) ?? w);
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(merged, null, 2));

  const still = langDefects(merged);
  console.log(still.length
    ? `🔴 아직 남음(${still.length}): ${still.join(' ')} — 다시 --repair 하거나 손으로 볼 것`
    : `✅ 전부 해결 — ${OUTPUT_PATH}`);
}

main().catch(e => { console.error('치명적 오류:', e); process.exit(1); });
