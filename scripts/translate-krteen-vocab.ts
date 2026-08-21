/**
 * 한국 10대 MZ 유행어(2026년 상반기 기준)를 한국어 풀이로 enrich.
 * 방향: ko → ko (한국인 대상, 한국어 뜻풀이). 맞춤법 덱과 동일하게 공통 슬롯에 직접 채워
 * integrate-vocab.ts 일반 분기로 통합:
 *   - definition  = 한 줄 요약
 *   - meaningKr 슬롯 = 자세한 풀이 + 유래
 *   - phonetic    = 빈 값 (한국어 표제어, 로마자 불필요)
 *   - exampleEn 슬롯 = 유행어를 쓴 캐주얼 한국어 예문 (원어, ko TTS)
 *   - exampleKr 슬롯 = 같은 뜻의 표준어 풀이 문장
 *
 * 입력: scripts/krteen-source.json ({rank, term, pos, category, hint}) — 직접 큐레이션
 * 출력: scripts/krteen-translated.json
 * 진행 파일: scripts/.krteen-progress.json (중단 후 재실행 가능)
 *
 * 실행: npx ts-node scripts/translate-krteen-vocab.ts
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
const SOURCE_PATH = path.resolve(process.cwd(), 'scripts/krteen-source.json');
const OUTPUT_PATH = path.resolve(process.cwd(), 'scripts/krteen-translated.json');
const PROGRESS_PATH = path.resolve(process.cwd(), 'scripts/.krteen-progress.json');

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
  definition: string;
  phonetic: string;
  meaningKr: string;
  exampleEn: string;   // 슬롯 재사용 — 실제로는 ko 예문
  exampleKr: string;
  category: string;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function translateBatch(batch: SourceEntry[], retry = 0): Promise<TranslatedEntry[]> {
  const inputJson = JSON.stringify(
    batch.map(e => ({ term: e.term, hintPos: e.pos, brief: e.hint })),
    null, 0,
  );

  const prompt = `당신은 한국 10대·MZ세대 유행어를 쉽게 풀어주는 한국어 학습 큐레이션 작가입니다.
대상 독자는 이 유행어가 낯선 사람(부모 세대, 외국 동포, 트렌드를 놓친 사람)이며, 카드 한 장으로 뜻과 쓰임을 이해하게 돕습니다.

각 항목은 유행어(term)와 간단한 의미 힌트(brief)입니다. 힌트의 뜻을 신뢰하세요.

Input:
${inputJson}

각 항목 출력:
{
  "term": "<input의 term을 그대로 복사>",
  "pos": "명사 | 동사 | 형용사 | 부사 | 감탄사 | 구 중 하나",
  "definition": "한 줄 요약 뜻 (30자 이내). 예: \\"알아서 잘, 딱, 깔끔하고 센스있게\\"",
  "meaningKr": "뜻 + 어원/유래/쓰임을 1~2문장으로 친근하게 설명 (50~110자). 어떤 줄임말인지, 어디서 왔는지 포함하면 좋음.",
  "exampleEn": "그 유행어를 실제로 쓰는 자연스러운 캐주얼 한국어 대화체 예문 1개 (10~25자, 반말/요즘 채팅 톤).",
  "exampleKr": "위 예문을 유행어 없이 표준어로 풀어 쓴 문장 (같은 뜻, 10~30자)."
}

규칙:
- 정확히 ${batch.length}개, 동일 순서.
- term은 절대 변경하지 말 것 — 입력 그대로 복사.
- 모든 출력은 한국어. 영어 단어는 유행어 자체에 포함된 경우만 허용.
- SFW 엄수: 욕설·비속어 파생어(존나/존-, 시발/씨-, ㅈ/ㅆ 계열), 성적·혐오·차별·정치 표현 금지. 깨끗하고 유쾌한 일상 쓰임만.
- 예문은 반드시 그 유행어를 실제로 사용하고, 교과서가 아닌 진짜 채팅 말투로.
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
        phonetic: '', // 한국어 표제어 — 로마자 불필요
        meaningKr: String(w.meaningKr ?? ''),
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
