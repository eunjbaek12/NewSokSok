/**
 * 일본어 JLPT N3/N1 단어 소스 빌더 (중급/고급).
 *
 * 출처(CC BY-SA 4.0):
 *   - Wiktionary "Appendix:JLPT/N3", "Appendix:JLPT/N1" — wikitable
 *     (Kanji | Reading | Meaning | Frequency)
 *   - JMdict (jmdict-eng-common) — POS 검증
 *
 * 사전 준비:
 *   Invoke-WebRequest ".../Appendix:JLPT/N3..." -OutFile scripts/data/wiktionary-jlpt-n3-raw.json
 *   Invoke-WebRequest ".../Appendix:JLPT/N1..." -OutFile scripts/data/wiktionary-jlpt-n1-raw.json
 *
 * 실행:
 *   npx ts-node scripts/build-jp-jlpt-source.ts n3
 *   npx ts-node scripts/build-jp-jlpt-source.ts n1
 * 출력: scripts/jp-intermediate-source.json | scripts/jp-advanced-source.json
 *
 * 선정 방식: Frequency(낮을수록 고빈도, "5000 Most Frequent Words" 기준) 오름차순.
 * N/A는 후순위. 500개.
 */
import fs from 'fs';
import path from 'path';

const LEVEL = (process.argv[2] || '').toLowerCase();
if (!['n3', 'n1'].includes(LEVEL)) {
  console.error('❌ 사용법: npx ts-node scripts/build-jp-jlpt-source.ts <n3|n1>');
  process.exit(1);
}

const OUT_NAME = LEVEL === 'n3' ? 'jp-intermediate' : 'jp-advanced';
const WIKTI_RAW = path.resolve(process.cwd(), `scripts/data/wiktionary-jlpt-${LEVEL}-raw.json`);
const JMDICT_PATH = path.resolve(process.cwd(), 'scripts/data/jmdict-eng-common-3.6.2.json');
const OUTPUT = path.resolve(process.cwd(), `scripts/${OUT_NAME}-source.json`);
const TARGET_COUNT = 500;

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

interface WikiRow {
  kanji: string;     // 한자 표기 (없으면 빈 문자열)
  reading: string;   // 가나 읽기
  meaning: string;   // 영어 정의
  freq: number;      // 빈도 순위(낮을수록 고빈도). N/A는 Infinity
}

interface SourceEntry {
  rank: number;
  origFreq: number;
  term: string;
  reading: string;
  pos: string;
  definition: string;
  category: string;
  romaji: string;
}

function delinkJaToken(s: string): string {
  // {{l|ja|TEXT}} 또는 {{l|ja|TEXT|alt}} → TEXT
  const m = s.match(/\{\{l\|ja\|([^}|]+)(?:\|[^}]*)?\}\}/);
  return (m ? m[1] : s).trim();
}

function parseWikitable(wikitext: string): WikiRow[] {
  const rows: WikiRow[] = [];
  const lines = wikitext.split('\n');
  // 데이터 행 패턴: 셀이 || 로 구분되며 4개. 셀 일부가 비어있어도 (한자 미사용 가나어) 처리.
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith('|')) continue;
    if (line.startsWith('|-') || line.startsWith('|+') || line.startsWith('|}')) continue;
    if (line.startsWith('!')) continue;
    if (!line.includes('||')) continue;

    // 첫 '|' 제거하고 '||'로 분할
    const cells = line.replace(/^\|/, '').split('||').map(c => c.trim());
    if (cells.length < 4) continue;

    const kanji = delinkJaToken(cells[0]);
    const reading = delinkJaToken(cells[1]);
    if (!reading) continue;
    if (reading.startsWith('{{')) continue; // 파싱 실패

    const meaning = cells[2].replace(/\[\d+\]\s*/g, ' ').replace(/\s+/g, ' ').trim();
    if (!meaning) continue;

    const freqStr = cells[3].trim();
    const freq = /^\d+$/.test(freqStr) ? Number(freqStr) : Infinity;

    rows.push({ kanji, reading, meaning, freq });
  }
  return rows;
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

function humanPos(jmPos: string[]): string {
  const seen = new Set<string>();
  for (const p of jmPos) {
    const m = POS_MAP[p];
    if (m) seen.add(m);
  }
  return [...seen].join(', ') || jmPos[0] || '';
}

function main() {
  if (!fs.existsSync(WIKTI_RAW)) { console.error(`❌ 없음: ${WIKTI_RAW}`); process.exit(1); }
  if (!fs.existsSync(JMDICT_PATH)) { console.error(`❌ JMdict 없음: ${JMDICT_PATH}`); process.exit(1); }

  const wikitext = JSON.parse(fs.readFileSync(WIKTI_RAW, 'utf8')).parse.wikitext['*'];
  const rows = parseWikitable(wikitext);
  console.log(`📖 Wiktionary JLPT ${LEVEL.toUpperCase()}: ${rows.length}개 파싱`);

  const jmdict = JSON.parse(fs.readFileSync(JMDICT_PATH, 'utf8'));
  const idx = buildJmdictIndex(jmdict);
  console.log(`📚 JMdict: ${jmdict.words.length}개 표제어`);

  // 표제어 중복 제거 (term|reading)
  const byKey = new Map<string, WikiRow>();
  for (const r of rows) {
    const term = r.kanji || r.reading;
    const key = `${term}|${r.reading}`;
    const existing = byKey.get(key);
    if (!existing || r.freq < existing.freq) byKey.set(key, r);
  }

  // 빈도순 정렬 (낮을수록 고빈도, N/A는 후순위) 후 상위 500
  const sorted = [...byKey.values()].sort((a, b) => a.freq - b.freq);
  if (sorted.length < TARGET_COUNT) {
    console.error(`❌ 후보 ${sorted.length}개 (목표 ${TARGET_COUNT})`);
    process.exit(1);
  }
  const picked = sorted.slice(0, TARGET_COUNT);

  const source: SourceEntry[] = [];
  let matched = 0, fallback = 0;

  for (const w of picked) {
    const term = w.kanji || w.reading;
    // JMdict 매칭
    let jm: JmdictWord | null = null;
    if (w.kanji) {
      const cands = idx.byKanji.get(w.kanji);
      if (cands) {
        jm = cands.find(c => c.kana.some(kk => kk.text === w.reading)) ?? cands[0];
      }
    }
    if (!jm) {
      const cands = idx.byKana.get(w.reading);
      if (cands) jm = cands[0];
    }

    let pos = '';
    let definition = w.meaning;
    if (jm) {
      matched++;
      pos = humanPos(jm.sense[0].partOfSpeech);
      const jmDef = jm.sense[0].gloss.map(g => g.text).join('; ');
      if (w.meaning.length < 8 && jmDef) definition = jmDef;
    } else {
      fallback++;
    }

    source.push({
      rank: source.length + 1,
      origFreq: Number.isFinite(w.freq) ? w.freq : -1,
      term,
      reading: w.reading,
      pos,
      definition,
      category: `JLPT ${LEVEL.toUpperCase()}`,
      romaji: '',
    });
  }

  fs.writeFileSync(OUTPUT, JSON.stringify(source, null, 2));
  console.log(`✅ ${source.length}개 추출 (JMdict 매칭 ${matched}, fallback ${fallback}) → ${OUTPUT}`);
  console.log('샘플(앞 10):', source.slice(0, 10).map(s => `${s.term}(${s.reading})`).join(', '));
  console.log('샘플(뒤 5):', source.slice(-5).map(s => `${s.term}(${s.reading})`).join(', '));
  const noFreq = source.filter(s => s.origFreq === -1).length;
  console.log(`📊 빈도 N/A: ${noFreq}개 (후순위 채움)`);
}

main();
