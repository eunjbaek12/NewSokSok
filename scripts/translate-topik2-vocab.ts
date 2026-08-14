/** TOPIK II 300개 표제어를 Vertex Edge Function으로 영어 카드 내용으로 생성한다. */
import fs from 'fs';
import path from 'path';
import { collectFindings, reportFindings, SHARED_PROMPT_RULES } from './lib/ko-deck-checks';

interface Source { rank: number; term: string; pos: string; category: string; levelBand: '3-4' | '5-6'; collocations: string[]; hint: string; }
interface Result extends Source { meaningEn: string; romaja: string; exampleKo: string; exampleEn: string; }
const BATCH = 15;
const env = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '';
const url = (env.match(/^EXPO_PUBLIC_SUPABASE_URL=(.*)$/m)?.[1] ?? '').trim();
const token = process.env.TOPIK2_CLASSIFY_TOKEN ?? '';
if (!url || !token) throw new Error('EXPO_PUBLIC_SUPABASE_URL과 TOPIK2_CLASSIFY_TOKEN이 필요합니다.');
const sourcePath = path.resolve('scripts/topik2-source.json');
const progressPath = path.resolve('scripts/.topik2-translate-progress.json');
const outputPath = path.resolve('scripts/topik2-translated.json');
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function translate(batch: Source[], attempt = 0): Promise<Result[]> {
  try {
    const res = await fetch(`${url}/functions/v1/topik2-translate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Topik2-Token': token },
      body: JSON.stringify({ items: batch }), signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    if (!Array.isArray(data.results) || data.results.length !== batch.length) throw new Error('응답 길이 불일치');
    return batch.map((src, index) => {
      const value = data.results[index] ?? {};
      return { ...src, pos: String(value.pos ?? src.pos), meaningEn: String(value.meaningEn ?? ''), romaja: String(value.romaja ?? ''), exampleKo: String(value.exampleKo ?? ''), exampleEn: String(value.exampleEn ?? '') };
    });
  } catch (error) {
    if (attempt >= 4) throw error;
    const seconds = (attempt + 1) * 10;
    console.log(`retry in ${seconds}s: ${String(error)}`);
    await sleep(seconds * 1000);
    return translate(batch, attempt + 1);
  }
}

async function main() {
  const all: Source[] = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  const done: Result[] = fs.existsSync(progressPath) ? JSON.parse(fs.readFileSync(progressPath, 'utf8')) : [];
  if (done.length) console.log(`resume ${done.length}/${all.length}`);
  for (let i = done.length; i < all.length; i += BATCH) {
    const batch = all.slice(i, i + BATCH); const translated = await translate(batch);
    done.push(...translated); fs.writeFileSync(progressPath, JSON.stringify(done, null, 2));
    console.log(`${done.length}/${all.length}`); await sleep(1000);
  }
  const findings = collectFindings(done, { meaningMax: 70, exampleMax: 55 });
  if (!reportFindings(findings, done.length)) throw new Error('자동 품질 검사 실패');
  fs.writeFileSync(outputPath, JSON.stringify(done, null, 2));
  fs.unlinkSync(progressPath);
  console.log(`complete: ${outputPath}`);
}
main().catch(error => { console.error('TOPIK II translation failed', error); process.exit(1); });
