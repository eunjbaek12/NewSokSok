/**
 * NIKL B/C 기반 한국어 중·고급 후보 1,000개에서 TOPIK II 핵심 300개를 선정한다.
 *
 * AI는 분류·채점만 하고, 최종 수량·급수·주제 쿼터와 중복 금지는 코드가 강제한다.
 *
 * 입력: scripts/ko-intermediate-source.json, scripts/ko-advanced-source.json
 *       scripts/ko-intermediate-translated.json, scripts/ko-advanced-translated.json
 * 출력: scripts/topik2-candidates.json (전체 채점 결과)
 *       scripts/topik2-source.json (최종 300개)
 * 진행: scripts/.topik2-selection-progress.json
 *
 * 실행: npx ts-node -P tsconfig.scripts.json scripts/build-topik2-source.ts
 */
import fs from 'fs';
import path from 'path';

const USE_VERTEX = process.argv.includes('--vertex');
const MODEL = process.argv.includes('--model=lite') ? 'gemini-2.5-flash-lite' : 'gemini-2.5-flash';
// 후보 정보가 예문까지 포함해 크다. 40개 배치는 Gemini에서
// 첫 요청부터 2분 이상 멈춰 10개로 줄였다.
const BATCH_SIZE = 10;
const TOPICS = [
  '사회·인간관계', '교육·직업', '경제·소비',
  '환경·과학', '문화·미디어', '추상어·논리',
] as const;
const TOPIC_QUOTA: Record<string, number> = {
  '사회·인간관계': 50, '교육·직업': 50, '경제·소비': 50,
  '환경·과학': 50, '문화·미디어': 50, '추상어·논리': 50,
};

interface SourceEntry { rank: number; origRank?: number; term: string; pos: string; grade: 'B' | 'C'; }
interface TranslatedEntry { term: string; meaningEn?: string; exampleKo?: string; }
interface Candidate extends SourceEntry {
  meaningEn: string;
  topic: typeof TOPICS[number];
  levelBand: '3-4' | '5-6';
  topikValue: number;
  generalUse: number;
  collocationValue: number;
  collocations: string[];
  hint: string;
  exclude: boolean;
  reason: string;
  score: number;
}

function envKey(): string {
  const p = path.resolve('.env');
  if (!fs.existsSync(p)) return '';
  const text = fs.readFileSync(p, 'utf8');
  return (text.match(/^GEMINI_API_KEY=(.*)$/m) ?? text.match(/^EXPO_PUBLIC_GEMINI_API_KEY=(.*)$/m))?.[1]?.trim() ?? '';
}

const KEY = envKey();
const envText = fs.existsSync(path.resolve('.env')) ? fs.readFileSync(path.resolve('.env'), 'utf8') : '';
const SUPABASE_URL = (envText.match(/^EXPO_PUBLIC_SUPABASE_URL=(.*)$/m)?.[1] ?? '').trim();
const VERTEX_TOKEN = process.env.TOPIK2_CLASSIFY_TOKEN ?? '';
if (USE_VERTEX && (!SUPABASE_URL || !VERTEX_TOKEN)) throw new Error('Vertex 모드는 EXPO_PUBLIC_SUPABASE_URL과 TOPIK2_CLASSIFY_TOKEN이 필요합니다.');
if (!USE_VERTEX && !KEY) throw new Error('GEMINI_API_KEY가 .env에 없습니다.');
const API_URL = USE_VERTEX
  ? `${SUPABASE_URL}/functions/v1/topik2-classify`
  : `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function loadInputs(): Array<SourceEntry & { meaningEn: string; exampleKo: string }> {
  const result: Array<SourceEntry & { meaningEn: string; exampleKo: string }> = [];
  for (const stem of ['ko-intermediate', 'ko-advanced']) {
    const source: SourceEntry[] = JSON.parse(fs.readFileSync(path.resolve(`scripts/${stem}-source.json`), 'utf8'));
    const translated: TranslatedEntry[] = JSON.parse(fs.readFileSync(path.resolve(`scripts/${stem}-translated.json`), 'utf8'));
    const byTerm = new Map(translated.map(w => [w.term, w]));
    for (const item of source) {
      const detail = byTerm.get(item.term);
      result.push({ ...item, meaningEn: detail?.meaningEn ?? '', exampleKo: detail?.exampleKo ?? '' });
    }
  }
  return result;
}

async function classify(batch: ReturnType<typeof loadInputs>, retry = 0): Promise<Candidate[]> {
  const input = batch.map(({ term, pos, grade, meaningEn, exampleKo }) => ({ term, pos, grade, meaningEn, exampleKo }));
  const prompt = `You are selecting a compact 400-word TOPIK II extension deck for learners who already completed TOPIK I.

Classify and score every Korean headword below. Do not select words merely because they are advanced. Prefer words useful across TOPIK II reading, listening and writing.

Input: ${JSON.stringify(input)}

Return ONLY a JSON array in the same order with exactly ${batch.length} objects:
{"term":"exact input","topic":"one allowed topic","levelBand":"3-4 or 5-6","topikValue":0,"generalUse":0,"collocationValue":0,"collocations":["up to two natural Korean combinations"],"hint":"concise English sense plus usage distinction","exclude":false,"reason":"short Korean reason"}

Allowed topics: ${TOPICS.join(', ')}
Scores: topikValue 0-4, generalUse 0-3, collocationValue 0-2.
Set exclude=true for elementary pronouns/interjections, obsolete or literary-only items, narrow specialist terminology, weak standalone function words, or items with little value in a compact TOPIK II deck.
Choose exactly one representative topic. Use grade B as a strong signal for 3-4 and C for 5-6, but correct obvious mismatches. Keep collocations empty only if none is natural. Do not invent meanings.`;

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: USE_VERTEX
        ? { 'Content-Type': 'application/json', 'X-Topik2-Token': VERTEX_TOKEN }
        : { 'Content-Type': 'application/json' },
      body: USE_VERTEX
        ? JSON.stringify({ items: input })
        : JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, responseMimeType: 'application/json' } }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error(`${response.status}: ${(await response.text()).slice(0, 200)}`);
    const data = await response.json();
    const parsed = USE_VERTEX
      ? data.results
      : JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]');
    if (!Array.isArray(parsed) || parsed.length !== batch.length) throw new Error(`응답 길이 ${parsed.length}/${batch.length}`);
    return batch.map((src, i) => {
      const a = parsed[i];
      const topic = TOPICS.includes(a.topic) ? a.topic : '추상어·논리';
      const topikValue = Math.max(0, Math.min(4, Number(a.topikValue) || 0));
      const generalUse = Math.max(0, Math.min(3, Number(a.generalUse) || 0));
      const collocationValue = Math.max(0, Math.min(2, Number(a.collocationValue) || 0));
      return { ...src, topic, levelBand: a.levelBand === '5-6' ? '5-6' : '3-4', topikValue, generalUse,
        collocationValue, collocations: Array.isArray(a.collocations) ? a.collocations.slice(0, 2).map(String) : [],
        hint: String(a.hint ?? src.meaningEn), exclude: Boolean(a.exclude), reason: String(a.reason ?? ''),
        score: topikValue + generalUse + collocationValue };
    });
  } catch (error) {
    if (retry >= 5) throw error;
    const wait = [10, 20, 40, 80, 160][retry];
    console.log(`⚠️ ${String(error)} — ${wait}초 후 재시도`);
    await sleep(wait * 1000);
    return classify(batch, retry + 1);
  }
}

function select(candidates: Candidate[]): Candidate[] {
  const chosen: Candidate[] = [];
  for (const topic of TOPICS) {
    const pool = candidates.filter(c => c.topic === topic && !c.exclude)
      .sort((a, b) => b.score - a.score || (a.grade === 'B' ? -1 : 1) || a.origRank! - b.origRank!);
    const quota = TOPIC_QUOTA[topic];
    // 전체 280:120 비율을 주제별로도 대략 유지한다.
    const advancedQuota = Math.round(quota * 0.3);
    const advanced = pool.filter(c => c.levelBand === '5-6').slice(0, advancedQuota);
    const regular = pool.filter(c => c.levelBand === '3-4').slice(0, quota - advanced.length);
    const selected = [...regular, ...advanced];
    if (selected.length < quota) {
      const used = new Set(selected.map(c => c.term));
      selected.push(...pool.filter(c => !used.has(c.term)).slice(0, quota - selected.length));
    }
    if (selected.length !== quota) throw new Error(`${topic} 후보 부족: ${selected.length}/${quota}`);
    chosen.push(...selected);
  }
  const band56 = chosen.filter(c => c.levelBand === '5-6').length;
  console.log(`📊 선정 ${chosen.length}개 (3-4: ${chosen.length - band56}, 5-6: ${band56})`);
  return chosen.sort((a, b) => TOPICS.indexOf(a.topic) - TOPICS.indexOf(b.topic) || b.score - a.score)
    .map((c, i) => ({ ...c, rank: i + 1 }));
}

async function main() {
  const input = loadInputs();
  const topik1 = new Set((JSON.parse(fs.readFileSync(path.resolve('scripts/topik1-source.json'), 'utf8')) as SourceEntry[]).map(w => w.term));
  if (input.some(w => topik1.has(w.term))) throw new Error('TOPIK I과 표제어가 중복됩니다.');
  const progressPath = path.resolve('scripts/.topik2-selection-progress.json');
  const progress: Candidate[] = fs.existsSync(progressPath) ? JSON.parse(fs.readFileSync(progressPath, 'utf8')) : [];
  for (let i = progress.length; i < input.length; i += BATCH_SIZE) {
    const result = await classify(input.slice(i, i + BATCH_SIZE));
    progress.push(...result);
    fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));
    console.log(`✅ ${progress.length}/${input.length}`);
    await sleep(1200);
  }
  fs.writeFileSync(path.resolve('scripts/topik2-candidates.json'), JSON.stringify(progress, null, 2));
  const selected = select(progress).map(({ rank, term, pos, topic: category, levelBand, collocations, hint }) =>
    ({ rank, term, pos, category, levelBand, collocations, hint }));
  if (new Set(selected.map(w => w.term)).size !== 300 || selected.some(w => topik1.has(w.term))) throw new Error('최종 중복 검사 실패');
  fs.writeFileSync(path.resolve('scripts/topik2-source.json'), JSON.stringify(selected, null, 2));
  console.log('✅ scripts/topik2-source.json 생성 완료');
}

main().catch(error => { console.error('❌', error); process.exit(1); });
