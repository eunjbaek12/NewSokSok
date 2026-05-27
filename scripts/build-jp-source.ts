/**
 * 일본어 초급 단어 소스 빌더.
 *
 * 출처(둘 다 CC BY-SA 4.0):
 *   - Wiktionary "Appendix:1000 Japanese basic words" — 카테고리별 큐레이션
 *   - jmdict-simplified (jmdict-eng-common) — POS·영어 정의 검증
 *
 * 사전 준비:
 *   curl "https://en.wiktionary.org/w/api.php?action=parse&page=Appendix:1000_Japanese_basic_words&format=json&prop=wikitext" -o scripts/data/wiktionary-jp1000-raw.json
 *   (jmdict 다운로드 명령은 본 파일 상단 주석 참고)
 *
 * 실행: npx ts-node scripts/build-jp-source.ts
 * 출력: scripts/jp-source.json
 */
import fs from 'fs';
import path from 'path';

const WIKTI_RAW = path.resolve(process.cwd(), 'scripts/data/wiktionary-jp1000-raw.json');
const JMDICT_PATH = path.resolve(process.cwd(), 'scripts/data/jmdict-eng-common-3.6.2.json');
const OUTPUT = path.resolve(process.cwd(), 'scripts/jp-source.json');

const POS_MAP: Record<string, string> = {
  n: 'noun', 'n-adv': 'noun', 'n-pref': 'noun', 'n-suf': 'noun', 'n-t': 'noun', pn: 'pronoun',
  v1: 'verb', v5: 'verb', 'v5u': 'verb', 'v5k': 'verb', 'v5g': 'verb', 'v5s': 'verb',
  'v5t': 'verb', 'v5n': 'verb', 'v5b': 'verb', 'v5m': 'verb', 'v5r': 'verb', vs: 'verb',
  'vs-i': 'verb', 'vs-s': 'verb', vk: 'verb', vi: 'verb', vt: 'verb',
  'adj-i': 'adjective', 'adj-na': 'adjective', 'adj-no': 'adjective', 'adj-pn': 'adjective',
  'adj-t': 'adjective', 'adj-f': 'adjective',
  adv: 'adverb', 'adv-to': 'adverb',
  exp: 'phrase', int: 'interjection', conj: 'conjunction', prt: 'particle',
  ctr: 'counter', num: 'number', aux: 'auxiliary', 'aux-v': 'auxiliary',
  pref: 'prefix', suf: 'suffix',
};

const HIRAGANA_RE = /^[぀-ゟーー]+$/;

interface WiktiEntry {
  rank: number;
  category: string;
  kanaForms: string[];
  kanjiForms: string[];
  english: string;
  romaji: string;
}

interface SourceEntry {
  rank: number;
  term: string;       // 표기형 (한자 있으면 한자, 없으면 가나)
  reading: string;    // 가나(읽기)
  pos: string;        // human-readable
  definition: string; // 영어 정의
  category: string;
  romaji: string;
}

function isHiragana(s: string): boolean {
  return HIRAGANA_RE.test(s.trim());
}

function parseWiktionary(wikitext: string): WiktiEntry[] {
  const entries: WiktiEntry[] = [];
  const lines = wikitext.split('\n');
  let h2 = '', h3 = '', h4 = '';
  let rank = 0;

  for (const raw of lines) {
    const line = raw.trim();
    const h4m = line.match(/^====([^=]+)====$/);
    const h3m = line.match(/^===([^=]+)===$/);
    const h2m = line.match(/^==([^=]+)==$/);
    if (h4m) { h4 = h4m[1].trim(); continue; }
    if (h3m) { h3 = h3m[1].trim(); h4 = ''; continue; }
    if (h2m) { h2 = h2m[1].trim(); h3 = ''; h4 = ''; continue; }

    if (!line.startsWith('*')) continue;

    // Extract all {{l|ja|TEXT}} tokens
    const tokens: string[] = [];
    const tokenRe = /\{\{l\|ja\|([^}|]+)(?:\|[^}]*)?\}\}/g;
    let m: RegExpExecArray | null;
    while ((m = tokenRe.exec(line)) !== null) {
      tokens.push(m[1].trim());
    }
    if (tokens.length === 0) continue;

    // Split into kana vs kanji
    const kanaForms = tokens.filter(t => isHiragana(t));
    const kanjiForms = tokens.filter(t => !isHiragana(t));
    if (kanaForms.length === 0) continue; // 가나 읽기 없으면 패스

    // English between '–' and '(''romaji'')'
    const afterDash = line.split(/–|—|-/).slice(1).join('-').trim();
    let english = afterDash;
    let romaji = '';
    const romajiMatch = afterDash.match(/\(''([^']+)''(?:[^)]*)?\)/);
    if (romajiMatch) {
      romaji = romajiMatch[1].trim();
      english = afterDash.slice(0, romajiMatch.index).trim();
    }
    // 영어 부분에서 후행 코멘트 제거
    english = english.replace(/\s+\(.*$/, '').trim();
    if (!english) continue;

    const category = [h2, h3, h4].filter(Boolean).join(' > ');

    entries.push({
      rank: ++rank,
      category,
      kanaForms,
      kanjiForms,
      english,
      romaji,
    });
  }
  return entries;
}

interface JmdictWord {
  kanji: { common: boolean; text: string }[];
  kana: { common: boolean; text: string }[];
  sense: { partOfSpeech: string[]; gloss: { text: string }[] }[];
}

function buildJmdictIndex(jmdict: { words: JmdictWord[] }) {
  const byKana = new Map<string, JmdictWord[]>();
  const byKanji = new Map<string, JmdictWord[]>();
  for (const w of jmdict.words) {
    for (const k of w.kana || []) {
      const arr = byKana.get(k.text) ?? [];
      arr.push(w);
      byKana.set(k.text, arr);
    }
    for (const k of w.kanji || []) {
      const arr = byKanji.get(k.text) ?? [];
      arr.push(w);
      byKanji.set(k.text, arr);
    }
  }
  return { byKana, byKanji };
}

function pickJmdictMatch(
  w: WiktiEntry,
  idx: ReturnType<typeof buildJmdictIndex>,
): JmdictWord | null {
  // 1) 한자 형태 매칭
  for (const kj of w.kanjiForms) {
    const cands = idx.byKanji.get(kj);
    if (cands) {
      // 같은 단어에 여러 매칭 — 가나 읽기가 같은 것 우선
      const sameRead = cands.find(c => c.kana.some(kk => w.kanaForms.includes(kk.text)));
      return sameRead ?? cands[0];
    }
  }
  // 2) 가나 형태 매칭
  for (const ka of w.kanaForms) {
    const cands = idx.byKana.get(ka);
    if (cands) return cands[0];
  }
  return null;
}

function humanPos(jmPos: string[]): string {
  const seen = new Set<string>();
  for (const p of jmPos) {
    const m = POS_MAP[p];
    if (m) seen.add(m);
  }
  return [...seen].join(', ') || jmPos[0] || '';
}

function main() {
  if (!fs.existsSync(WIKTI_RAW)) {
    console.error(`❌ Wiktionary raw 없음: ${WIKTI_RAW}`);
    process.exit(1);
  }
  if (!fs.existsSync(JMDICT_PATH)) {
    console.error(`❌ JMdict 없음: ${JMDICT_PATH}`);
    process.exit(1);
  }

  const wikitext = JSON.parse(fs.readFileSync(WIKTI_RAW, 'utf8')).parse.wikitext['*'];
  const wikti = parseWiktionary(wikitext);
  console.log(`📖 Wiktionary: ${wikti.length}개 엔트리 파싱`);

  const jmdict = JSON.parse(fs.readFileSync(JMDICT_PATH, 'utf8'));
  const idx = buildJmdictIndex(jmdict);
  console.log(`📚 JMdict: ${jmdict.words.length}개 표제어 인덱싱`);

  const source: SourceEntry[] = [];
  let matched = 0, fallback = 0;
  const seen = new Set<string>();

  for (const w of wikti) {
    const term = w.kanjiForms[0] || w.kanaForms[0];
    const reading = w.kanaForms[0];
    const key = `${term}|${reading}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const match = pickJmdictMatch(w, idx);
    let pos = '';
    let definition = w.english;
    if (match) {
      matched++;
      pos = humanPos(match.sense[0].partOfSpeech);
      const jmDef = match.sense[0].gloss.map(g => g.text).join('; ');
      // Wiktionary 영어가 너무 짧으면 JMdict 정의로 보완
      if (w.english.length < 8 && jmDef) definition = jmDef;
    } else {
      fallback++;
    }

    source.push({
      rank: source.length + 1,
      term,
      reading,
      pos,
      definition,
      category: w.category,
      romaji: w.romaji,
    });
  }

  console.log(`✅ ${source.length}개 추출 (JMdict 매칭 ${matched}, fallback ${fallback})`);
  fs.writeFileSync(OUTPUT, JSON.stringify(source, null, 2));
  console.log(`💾 ${OUTPUT}`);

  // 카테고리 분포 미리보기
  const catCount = new Map<string, number>();
  for (const s of source) catCount.set(s.category, (catCount.get(s.category) ?? 0) + 1);
  const top10 = [...catCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  console.log('\n📊 상위 10 카테고리:');
  for (const [c, n] of top10) console.log(`  ${n.toString().padStart(4)}  ${c}`);
}

main();
