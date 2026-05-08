/**
 * Wiktionary에서 단어 데이터를 가져옵니다.
 * - 영어 정의, IPA, 품사, 한국어 번역 추출
 * - 한국어 번역이 없는 단어는 missing으로 표시
 *
 * 실행: npx ts-node scripts/fetch-wiktionary.ts <list-name>
 *   예) npx ts-node scripts/fetch-wiktionary.ts tsl
 *       npx ts-node scripts/fetch-wiktionary.ts nawl
 *
 * 출력: scripts/<list-name>-wiktionary.json
 */

import fs from 'fs';
import path from 'path';

const LIST_NAME = process.argv[2]?.toLowerCase();
if (!LIST_NAME) {
  console.error('❌ 사용법: npx ts-node scripts/fetch-wiktionary.ts <list-name>');
  process.exit(1);
}

const SOURCE_MAP: Record<string, string> = {
  tsl: 'tsl-top600-source.json',
  nawl: 'nawl-source.json',
  bsl: 'bsl-source.json',
  ngsl: 'ngsl-source.json',
};

const sourceFile = SOURCE_MAP[LIST_NAME];
if (!sourceFile) {
  console.error(`❌ 알 수 없는 목록: ${LIST_NAME}`);
  process.exit(1);
}

const SOURCE_PATH = path.resolve(process.cwd(), `scripts/${sourceFile}`);
const OUTPUT_PATH = path.resolve(process.cwd(), `scripts/${LIST_NAME}-wiktionary.json`);
const PROGRESS_PATH = path.resolve(process.cwd(), `scripts/.${LIST_NAME}-wikt-progress.json`);

const DELAY_MS = 200; // 5 req/sec — Wiktionary API 친화적
const USER_AGENT = 'SokSokVoca/1.0 (vocabulary learning app; contact: educational use)';

interface SourceEntry {
  rank: number;
  term: string;
  definition: string;
}

interface WiktionaryEntry {
  rank: number;
  term: string;
  phonetic: string;
  pos: string;
  definition: string;
  meaningKr: string;
  exampleEn: string;
  hasMeaningKr: boolean;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function cleanKorean(raw: string): string {
  return raw
    .replace(/\([^\)]*\)/g, '')  // 괄호 안 한자 제거 (고객(顧客) → 고객)
    .replace(/\[\[[^\]]*\|([^\]]*)\]\]/g, '$1')  // 위키링크 [[word|display]] → display
    .replace(/\[\[([^\]]*)\]\]/g, '$1')  // [[word]] → word
    .replace(/'{2,}/g, '')  // ''bold'' 제거
    .replace(/\{\{[^}]*\}\}/g, '')  // {{template}} 제거
    .trim();
}

async function fetchWord(term: string): Promise<Omit<WiktionaryEntry, 'rank'>> {
  const encoded = encodeURIComponent(term);

  try {
    // REST API for definitions and POS
    const r1 = await fetch(`https://en.wiktionary.org/api/rest_v1/page/definition/${encoded}`, {
      headers: { 'User-Agent': USER_AGENT },
    });
    const d1 = r1.ok ? await r1.json() : {};
    const engEntry = d1.en?.[0];
    const pos = engEntry?.partOfSpeech ?? '';
    const defRaw = engEntry?.definitions?.[0]?.definition ?? '';
    const definition = defRaw.replace(/<[^>]+>/g, '').trim();
    const exampleEn = engEntry?.definitions?.[0]?.examples?.[0]?.replace(/<[^>]+>/g, '').trim() ?? '';

    // MediaWiki API for full wikitext (IPA + Korean translations)
    const r2 = await fetch(
      `https://en.wiktionary.org/w/api.php?action=parse&page=${encoded}&prop=wikitext&format=json`,
      { headers: { 'User-Agent': USER_AGENT } },
    );
    const d2 = r2.ok ? await r2.json() : {};
    const wt: string = d2.parse?.wikitext?.['*'] ?? '';

    // IPA extraction
    const ipaMatch = wt.match(/\{\{IPA[^}]*\|([\/\[][^|}\n]{2,40}[\/\])[|}]/);
    const phonetic = ipaMatch?.[1]?.trim() ?? '';

    // Korean translation extraction: {{t+|ko|고객}} or {{t|ko|word}} or {{t!|ko|word}}
    const koRaw = [...wt.matchAll(/\{\{t[\+!]?\|ko\|([^|}\n]+)/g)]
      .map(m => cleanKorean(m[1]))
      .filter(k => k.length > 0 && /[가-힣]/.test(k)) // 한글 포함된 것만
      .slice(0, 3);

    const meaningKr = koRaw.join(', ');

    return {
      term,
      phonetic,
      pos,
      definition,
      meaningKr,
      exampleEn,
      hasMeaningKr: meaningKr.length > 0,
    };
  } catch (e: any) {
    return {
      term,
      phonetic: '',
      pos: '',
      definition: '',
      meaningKr: '',
      exampleEn: '',
      hasMeaningKr: false,
    };
  }
}

function loadProgress(): WiktionaryEntry[] {
  if (fs.existsSync(PROGRESS_PATH)) return JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8'));
  return [];
}

function saveProgress(items: WiktionaryEntry[]) {
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify(items, null, 2));
}

async function main() {
  if (!fs.existsSync(SOURCE_PATH)) {
    console.error(`❌ 소스 파일 없음: ${SOURCE_PATH}`);
    process.exit(1);
  }

  const source: SourceEntry[] = JSON.parse(fs.readFileSync(SOURCE_PATH, 'utf8'));
  console.log(`📚 [${LIST_NAME.toUpperCase()}] ${source.length}개 단어 Wiktionary 조회 시작`);

  const done = loadProgress();
  const doneTerms = new Set(done.map(d => d.term));
  if (done.length > 0) console.log(`📂 진행 파일: ${done.length}개 처리됨, 이어서 시작`);

  const results: WiktionaryEntry[] = [...done];

  for (let i = 0; i < source.length; i++) {
    const src = source[i];
    if (doneTerms.has(src.term)) continue;

    const entry = await fetchWord(src.term);
    results.push({ rank: src.rank, ...entry });

    if ((i + 1) % 50 === 0 || i === source.length - 1) {
      saveProgress(results);
      const withKr = results.filter(r => r.hasMeaningKr).length;
      console.log(`  [${i + 1}/${source.length}] 완료 — 한국어 있음: ${withKr}/${results.length} (${Math.round(withKr/results.length*100)}%)`);
    }

    if (i < source.length - 1) await sleep(DELAY_MS);
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2));

  const withKr = results.filter(r => r.hasMeaningKr).length;
  const missing = results.filter(r => !r.hasMeaningKr).map(r => r.term);
  console.log(`\n✅ Wiktionary 조회 완료: ${results.length}개`);
  console.log(`   한국어 있음: ${withKr}개 (${Math.round(withKr/results.length*100)}%)`);
  console.log(`   한국어 없음: ${missing.length}개 → AI로 보완 필요`);
  if (missing.length <= 30) console.log(`   누락: ${missing.join(', ')}`);

  if (fs.existsSync(PROGRESS_PATH)) fs.unlinkSync(PROGRESS_PATH);
}

main().catch(e => { console.error('오류:', e); process.exit(1); });
