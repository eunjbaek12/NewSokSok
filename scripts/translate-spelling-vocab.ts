/**
 * 자주 틀리는 한국어 맞춤법 100쌍에 정의·예문·대조 해설 enrich (Gemini, ko→ko).
 *
 * 입력: scripts/spelling-source.json (build-spelling-source.ts 산출)
 * 출력: scripts/spelling-translated.json
 * 진행 파일: scripts/.spelling-progress.json
 *
 * 실행: npx ts-node scripts/translate-spelling-vocab.ts
 * 옵션:
 *   --limit=N     상위 N개만 처리
 *   --model=NAME  모델 지정 (기본값·주의사항은 scripts/_shared/model.ts)
 *
 * 출력 스키마는 integrate-vocab.ts의 "일반 분기"(non-ko→en) 슬롯에 맞춤:
 *   - term      : 올바른 표기 (카드 앞면)
 *   - pos       : '맞춤법 - {category}'
 *   - definition: 한 줄 핵심 (자주 틀리는 짝 포함)
 *   - meaningKr : 자세한 의미·구분법
 *   - phonetic  : 비움
 *   - exampleEn : 한국어 올바른 예문 (TTS는 ko로) ← 슬롯 재사용
 *   - exampleKr : 자주 틀리는 형태가 들어간 대조 예문 + 해설
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
  console.error('❌ GEMINI_API_KEY 가 .env에 없습니다.');
  process.exit(1);
}

const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;
const SOURCE_PATH = path.resolve(process.cwd(), 'scripts/spelling-source.json');
const OUTPUT_PATH = path.resolve(process.cwd(), 'scripts/spelling-translated.json');
const PROGRESS_PATH = path.resolve(process.cwd(), 'scripts/.spelling-progress.json');

const BATCH_SIZE = 25;
const BATCH_DELAY_MS = 5000;

interface SourceEntry {
  rank: number;
  term: string;
  wrong: string;
  category: string;
  brief: string;
}

interface TranslatedEntry {
  rank: number;
  term: string;
  pos: string;
  definition: string;
  meaningKr: string;
  phonetic: string;
  exampleEn: string;   // 슬롯 재사용 — 실제로는 ko 예문
  exampleKr: string;
  category: string;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function translateBatch(batch: SourceEntry[], retry = 0): Promise<TranslatedEntry[]> {
  const inputJson = JSON.stringify(
    batch.map(e => ({ term: e.term, wrong: e.wrong, category: e.category, brief: e.brief })),
    null, 0,
  );

  const prompt = `당신은 한국인을 위한 한국어 맞춤법 학습 큐레이션 작가입니다.

각 항목은 "올바른 표기(term)"와 "자주 틀리는 표기(wrong)" 페어입니다. 학습자가 카드 한 장으로 헷갈림을 풀 수 있도록 정의·구분법·대조 예문을 만들어주세요.

Input:
${inputJson}

각 항목 출력:
{
  "term": "<input의 term을 그대로>",
  "definition": "한 줄 요약 — ‘${'${term}'}’ 올바름 (X ${'${wrong}'}). 35자 이내. 예: \\"'돼' 올바름 (X '되에'). '되어'의 줄임\\"",
  "meaningKr": "자세한 구분법·의미·어원 1~2문장 (60~120자). 학습자가 다시는 안 틀리도록 핵심 구분 기준 제시.",
  "exampleEn": "올바른 표기를 사용한 자연스러운 한국어 예문 1개 (10~22자). 일상/직장/대화 맥락.",
  "exampleKr": "잘못된 표기가 섞인 대조 예문 + 한 줄 해설. 예: \\"❌ '오늘 모임 잘 되에?' → ✅ '오늘 모임 잘 됐어?' ('되어'의 줄임)\\""
}

규칙:
- ${batch.length}개 정확히, 동일 순서.
- term은 절대 변경하지 말 것 — 입력 그대로 복사.
- 정의·예문 모두 한국어. 영어 사용 금지.
- 학습자에게 친근한 톤이지만 정확한 규범 근거(맞춤법 X장, 외래어 표기법 등) 있는 경우 한 마디 첨가 가능.
- ONLY JSON array.`;

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
        console.log(`  ⏳ ${response.status}, ${waits[retry]}초 대기...`);
        await sleep(waits[retry] * 1000);
        return translateBatch(batch, retry + 1);
      }
      throw new Error(`API ${response.status}: ${err.slice(0, 300)}`);
    }
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed: any[] = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) throw new Error('응답이 배열이 아님');
    if (parsed.length !== batch.length) throw new Error(`길이 불일치: ${batch.length} vs ${parsed.length}`);

    return batch.map((src, i) => {
      const w = parsed[i] ?? {};
      return {
        rank: src.rank,
        term: src.term,
        pos: `맞춤법 — ${src.category}`,
        definition: String(w.definition ?? ''),
        meaningKr: String(w.meaningKr ?? ''),
        phonetic: '',
        exampleEn: String(w.exampleEn ?? ''),
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
    console.error(`❌ 소스 없음: ${SOURCE_PATH}. build-spelling-source.ts 먼저 실행.`);
    process.exit(1);
  }
  const all: SourceEntry[] = JSON.parse(fs.readFileSync(SOURCE_PATH, 'utf8'));
  const source = all.slice(0, Math.min(LIMIT, all.length));
  console.log(`📚 ${source.length}개 enrich (model=${MODEL})`);

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
      process.exit(1);
    }
    if (i + BATCH_SIZE < source.length) await sleep(BATCH_DELAY_MS);
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2));
  console.log(`\n🎉 완료! ${OUTPUT_PATH} (${results.length}개)`);
  if (fs.existsSync(PROGRESS_PATH)) { fs.unlinkSync(PROGRESS_PATH); console.log('진행 파일 정리됨'); }
}

main().catch(e => { console.error('치명적 오류:', e); process.exit(1); });
