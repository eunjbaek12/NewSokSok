/**
 * 같은 표제어를 두 모델로 뽑아 나란히 세운다 — flash 일일 한도가 걸렸을 때
 * lite 로 이어 돌려도 되는지 눈으로 판정하기 위한 일회성 도구.
 *
 * 🔑 진행 파일(.ko-ladder-progress.json)과 산출물을 건드리지 않는다. 본 작업이
 *    백그라운드에서 돌고 있어도 안전하다.
 *
 * 실행: npx ts-node -P tsconfig.scripts.json scripts/compare-ladder-models.ts [--n=12]
 */
import fs from 'fs';
import path from 'path';
import { buildPrompt } from './translate-ko-ladder-vocab';

const nArg = process.argv.find(a => a.startsWith('--n='));
const N = nArg ? Number(nArg.split('=')[1]) : 12;

const envPath = path.resolve(process.cwd(), '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const KEY = (envContent.match(/^EXPO_PUBLIC_GEMINI_API_KEY=(.*)$/m)
  ?? envContent.match(/^GEMINI_API_KEY=(.*)$/m))?.[1].trim();
if (!KEY) { console.error('❌ GEMINI_API_KEY 없음'); process.exit(1); }

const url = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`;

async function run(model: string, prompt: string): Promise<any[]> {
  const r = await fetch(url(model), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, responseMimeType: 'application/json' },
    }),
  });
  if (!r.ok) throw new Error(`${model} → ${r.status}: ${(await r.text()).slice(0, 400)}`);
  const data: any = await r.json();
  return JSON.parse(data.candidates[0].content.parts[0].text);
}

async function main() {
  // flash 로 이미 만들어 둔 산출물에서 앞 N개를 고른다 — 같은 표제어라야 비교가 된다.
  const flashDone: any[] = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), 'scripts/.ko-ladder-progress.json'), 'utf8'));
  const sample = flashDone.filter(e => e.deck === 'advanced').slice(0, N);
  if (sample.length === 0) { console.error('❌ advanced 표본 없음'); process.exit(1); }

  const batch = sample.map(e => ({ deck: 'advanced' as const, term: e.term, pos: e.pos, grade: e.grade, rank: e.rank }));
  console.log(`📊 ${sample.length}개 표제어를 gemini-2.5-flash-lite 로 다시 생성해 대조\n`);

  const lite = await run('gemini-2.5-flash-lite', buildPrompt('advanced', batch));
  const liteByTerm = new Map(lite.map((x: any) => [String(x.term).trim(), x]));

  let meaningSame = 0;
  const lens: { flash: number[]; lite: number[] } = { flash: [], lite: [] };
  for (const f of sample) {
    const l = liteByTerm.get(f.term);
    if (!l) { console.log(`[${f.term}] lite 응답 없음`); continue; }
    lens.flash.push(f.exampleKo.length);
    lens.lite.push(String(l.exampleKo ?? '').length);
    if (f.meaningEn === l.meaningEn) meaningSame++;
    console.log(`■ ${f.term}  (${f.pos})`);
    console.log(`  뜻   flash: ${f.meaningEn}`);
    console.log(`       lite : ${l.meaningEn}`);
    console.log(`  예문 flash: ${f.exampleKo}`);
    console.log(`       lite : ${l.exampleKo}`);
    console.log(`  로마자 flash: ${f.romaja}   lite: ${l.romaja}`);
    console.log(`  usedForm     lite: ${l.usedForm}  (예문 포함: ${String(l.exampleKo ?? '').includes(String(l.usedForm ?? ''))})`);
    console.log('');
  }
  const avg = (a: number[]) => Math.round(a.reduce((s, x) => s + x, 0) / a.length);
  console.log(`뜻이 글자까지 같은 것: ${meaningSame}/${sample.length}`);
  console.log(`예문 평균 길이 — flash ${avg(lens.flash)}자 / lite ${avg(lens.lite)}자`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
