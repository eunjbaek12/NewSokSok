/**
 * 자주 틀리는 한국어 맞춤법 100쌍 추출 (Gemini, ko→ko).
 *
 * 출처: 국립국어원 어문규범 (공공저작물 KOGL Type 1, 출처 표시 시 자유이용) +
 *       위키문헌 한글 맞춤법 — 사실 정보로 저작권 보호 대상이 아님(idea/표제어 차원).
 * 출력: scripts/spelling-source.json
 *
 * 실행: npx ts-node scripts/build-spelling-source.ts
 * 옵션: --model=lite
 *
 * 카테고리 분포 (총 100):
 *   - 어미·활용         35
 *   - 동사·형용사 활용  25
 *   - 외래어 표기법     15
 *   - 사이시옷·표기     10
 *   - 관용·접두/접미사  15
 *
 * 각 항목 구조: { rank, term(올바름), wrong(자주 틀림), category, brief(아주 짧은 구분 hint) }
 */
import fs from 'fs';
import path from 'path';
import { resolveScriptModel } from './_shared/model';

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
const OUTPUT = path.resolve(process.cwd(), 'scripts/spelling-source.json');
const PROGRESS = path.resolve(process.cwd(), 'scripts/.spelling-source-progress.json');

interface SourceEntry {
  rank: number;
  term: string;     // 올바른 표기
  wrong: string;    // 자주 틀리는 표기
  category: string; // 어미·활용 | 동사·형용사 활용 | 외래어 표기법 | 사이시옷·표기 | 관용·접두/접미사
  brief: string;    // 한 줄 구분 hint
}

const BATCHES: { category: string; count: number; guide: string }[] = [
  { category: '어미·활용', count: 35, guide:
    '한국어 어미/조사/연결어미에서 자주 틀리는 페어. 예: 되/돼, 안/않, 던/든, ㄴ데/ㄴ대, 로서/로써, 든지/던지, ㄹ게/ㄹ께, 이에요/예요, 가르치다(가르키다 X)와 ‘가리키다’ 같은 활용 혼동도 포함.' },
  { category: '동사·형용사 활용', count: 25, guide:
    '뜻은 다른데 표기·발음 비슷해 자주 혼동하는 동사·형용사. 예: 부치다/붙이다, 잊다/잃다, 띠다/띄다, 맞히다/맞추다, 다르다/틀리다, 늘이다/늘리다, 넘어/너머, 거치다/걷히다.' },
  { category: '외래어 표기법', count: 15, guide:
    '국립국어원 외래어 표기법에 의해 정해진 형태 vs 흔히 쓰이는 잘못된 표기. 예: 메시지/메세지, 초콜릿/초콜렛, 슈퍼마켓/수퍼마켓, 액세서리/악세사리, 케이크/케익, 비스킷/비스켓, 도넛/도너츠, 콘텐츠/컨텐츠.' },
  { category: '사이시옷·표기', count: 10, guide:
    '사이시옷 적용 여부 / 받침 표기. 예: 등굣길/등교길, 햇살(맞음), 깨끗이/깨끗히, 일찍이/일찌기, 곰곰이/곰곰히, 사잇길/사이길, 머릿속/머리속, 횟수/회수, 숫자(맞음).' },
  { category: '관용·접두/접미사', count: 15, guide:
    '의미 차이로 자주 혼동되는 관용 표현 / 접두·접미사. 예: 결제/결재, 어떻게/어떡해, 일체/일절, 한참/한창, 작다/적다, 늘/늘상(X), 며칠(맞음)/몇일(X), 뵐게요/봬요, 웬일/왠일(X).' },
];

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function extractBatch(spec: typeof BATCHES[number], rankStart: number, retry = 0): Promise<SourceEntry[]> {
  const prompt = `한국어 맞춤법 학습 큐레이션을 만듭니다. 카테고리 "${spec.category}"에 해당하는, 한국인이 일상에서 가장 자주 틀리는 맞춤법 페어를 정확히 ${spec.count}개 추출해주세요.

가이드: ${spec.guide}

각 항목:
{
  "term": "올바른 표기 (한 단어, 한글)",
  "wrong": "자주 틀리는 표기 (한 단어, 한글)",
  "brief": "한 줄 구분법 또는 의미 차이 (40자 이내)"
}

규칙:
- term은 표준국어대사전 / 한글 맞춤법 기준 올바른 형태.
- wrong은 실제로 사람들이 흔히 쓰는 잘못된 표기. 가상의 예가 아닌 실제 빈발 오용.
- term/wrong 모두 한 단어(또는 한 어구). 문장 X.
- 잘 알려진 페어 우선. 학습자가 "아 이거 헷갈렸어!" 할 만한 것.
- 가이드의 예시는 참고용 — 그대로 쓰지 말고 카테고리 안에서 다양하게 선정. 중복 금지.
- ONLY JSON array. ${spec.count}개 정확히.`;

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
        console.log(`  ⏳ ${response.status}, ${waits[retry]}초 대기...`);
        await sleep(waits[retry] * 1000);
        return extractBatch(spec, rankStart, retry + 1);
      }
      throw new Error(`API ${response.status}: ${err.slice(0, 300)}`);
    }
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed: any[] = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) throw new Error('응답이 배열이 아님');
    if (parsed.length !== spec.count) {
      console.log(`  ⚠️ ${spec.category}: 기대 ${spec.count}, 받음 ${parsed.length}`);
    }
    return parsed.slice(0, spec.count).map((w, i) => ({
      rank: rankStart + i,
      term: String(w.term ?? '').trim(),
      wrong: String(w.wrong ?? '').trim(),
      category: spec.category,
      brief: String(w.brief ?? '').trim(),
    }));
  } catch (e: any) {
    if (retry < 2) {
      console.log(`  ⚠️ ${e.message}, 5초 후 재시도...`);
      await sleep(5000);
      return extractBatch(spec, rankStart, retry + 1);
    }
    throw e;
  }
}

function finalize(all: SourceEntry[]) {
  const seen = new Set<string>();
  const deduped = all.filter(e => {
    if (!e.term) return false;
    if (seen.has(e.term)) return false;
    seen.add(e.term);
    return true;
  }).map((e, i) => ({ ...e, rank: i + 1 }));
  fs.writeFileSync(OUTPUT, JSON.stringify(deduped, null, 2));
  return deduped;
}

async function main() {
  console.log(`📚 자주 틀리는 한국어 맞춤법 100쌍 추출 (model=${MODEL})`);

  // 진행 파일에서 카테고리별 완료 상태 로드
  const done: Record<string, SourceEntry[]> = fs.existsSync(PROGRESS)
    ? JSON.parse(fs.readFileSync(PROGRESS, 'utf8'))
    : {};
  const accum = Object.values(done).flat() as SourceEntry[];
  if (accum.length > 0) console.log(`📂 진행 ${accum.length}개 발견, 미완료 카테고리만 처리`);

  try {
    for (const spec of BATCHES) {
      if (done[spec.category]?.length >= spec.count) {
        console.log(`\n[${spec.category}] 이미 완료 (${done[spec.category].length}개) — 스킵`);
        continue;
      }
      console.log(`\n[${spec.category}] ${spec.count}개 추출`);
      const items = await extractBatch(spec, accum.length + 1);
      done[spec.category] = items;
      accum.push(...items);
      fs.writeFileSync(PROGRESS, JSON.stringify(done, null, 2));
      console.log(`  ✅ 누적 ${accum.length} (progress 저장)`);
      await sleep(2000);
    }
  } catch (e: any) {
    console.error(`\n❌ ${e.message}`);
    console.error(`진행 저장됨 (${accum.length}개). 동일 명령으로 재실행하면 미완료 카테고리만 처리합니다.`);
    finalize(accum); // 부분 결과도 일단 저장
    process.exit(1);
  }

  const deduped = finalize(accum);
  console.log(`\n🎉 ${deduped.length}쌍 → ${OUTPUT}`);
  console.log('샘플(앞 10):', deduped.slice(0, 10).map(e => `${e.term}/${e.wrong}`).join(', '));
  if (deduped.length < 100) {
    console.log(`⚠️ 100개 미만 (${deduped.length}). 중복 제거 후 부족.`);
  }
  if (fs.existsSync(PROGRESS)) { fs.unlinkSync(PROGRESS); console.log('진행 파일 정리됨'); }
}

main().catch(e => { console.error('치명적 오류:', e); process.exit(1); });
