/**
 * 중국어 초급(HSK 1급) 단어 소스 빌더.
 *
 * 출처(둘 다 CC BY-SA 4.0):
 *   - Wiktionary "Appendix:HSK list of Mandarin words v3.0/level 1" — 간체·병음·품사
 *   - CC-CEDICT (cc-cedict.org) — 영어 정의 보완
 *
 * 사전 준비:
 *   curl "https://en.wiktionary.org/w/api.php?action=parse&page=Appendix:HSK_list_of_Mandarin_words_v3.0/level_1&format=json&prop=wikitext" -o scripts/data/wiktionary-hsk1-raw.json
 *   curl -L "https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz" -o scripts/data/cedict.txt.gz && gunzip scripts/data/cedict.txt.gz
 *
 * 실행: npx ts-node scripts/build-zh-source.ts
 * 출력: scripts/zh-source.json
 */
import fs from 'fs';
import path from 'path';

const HSK_RAW = path.resolve(process.cwd(), 'scripts/data/wiktionary-hsk1-raw.json');
const CEDICT_PATH = path.resolve(process.cwd(), 'scripts/data/cedict.txt');
const OUTPUT = path.resolve(process.cwd(), 'scripts/zh-source.json');

const POS_MAP: Record<string, string> = {
  V: 'verb', N: 'noun', A: 'adjective', Num: 'number', Part: 'particle',
  Cl: 'classifier', Adv: 'adverb', Prep: 'preposition', Conj: 'conjunction',
  Pron: 'pronoun', Pref: 'prefix', Suf: 'suffix', Int: 'interjection',
  Aux: 'auxiliary', M: 'classifier', Mod: 'modal',
};

interface SourceEntry {
  rank: number;
  term: string;       // 간체
  traditional: string;
  reading: string;    // 병음 (성조부호)
  pos: string;        // human-readable
  definition: string; // 영어 (CC-CEDICT)
  category: string;
}

function mapPos(raw: string): string {
  const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
  const seen = new Set<string>();
  for (const p of parts) {
    const m = POS_MAP[p];
    if (m) seen.add(m);
  }
  return [...seen].join(', ') || raw.trim();
}

interface CedictEntry { trad: string; simp: string; pinyin: string; defs: string[] }

function loadCedict(): Map<string, CedictEntry[]> {
  const text = fs.readFileSync(CEDICT_PATH, 'utf8');
  const bySimp = new Map<string, CedictEntry[]>();
  const re = /^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\/(.+)\/\s*$/;
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const m = line.match(re);
    if (!m) continue;
    const entry: CedictEntry = {
      trad: m[1], simp: m[2], pinyin: m[3],
      defs: m[4].split('/').map(s => s.trim()).filter(Boolean),
    };
    const arr = bySimp.get(entry.simp) ?? [];
    arr.push(entry);
    bySimp.set(entry.simp, arr);
  }
  return bySimp;
}

function cleanDef(defs: string[]): string {
  // CC-CEDICT 정의에서 학습용으로 깔끔한 항목만 (변형/이체자 안내 제외), 최대 3개
  const useful = defs.filter(d =>
    !/^(variant of|see |old variant|abbr\. for|surname )/i.test(d) &&
    !d.startsWith('CL:') &&
    !/^\(/.test(d),
  );
  return (useful.length ? useful : defs).slice(0, 3).join('; ');
}

function parseHskTable(wikitext: string): { term: string; trad: string; pinyin: string; pos: string; category: string }[] {
  const rows: { term: string; trad: string; pinyin: string; pos: string; category: string }[] = [];
  const lines = wikitext.split('\n');
  let category = '';

  for (const raw of lines) {
    const line = raw.trim();
    const h3 = line.match(/^===([^=]+)===$/);
    if (h3) { category = h3[1].trim(); continue; }

    // 데이터 행: |[[繁]] || 简 || pīn || PoS || Notes
    if (!line.startsWith('|') || line.startsWith('|-') || line.startsWith('|+')) continue;
    if (line.startsWith('!')) continue; // 헤더

    const cells = line.replace(/^\|/, '').split('||').map(c => c.trim());
    if (cells.length < 4) continue;

    const delink = (s: string) => s.replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '$1').trim();
    // 변형 표기 정리: "爸爸/爸" → 주 형태, "有（一）些" → 괄호 내 선택 요소 제거
    const primary = (s: string) => delink(s).split('/')[0].replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '').trim();
    const trad = primary(cells[0]);
    const simp = primary(cells[1]);
    const pinyin = delink(cells[2]).split('/')[0].trim();
    const pos = cells[3].trim();
    if (!simp || !pinyin) continue;

    rows.push({ term: simp, trad, pinyin, pos, category });
  }
  return rows;
}

function main() {
  if (!fs.existsSync(HSK_RAW)) { console.error(`❌ HSK raw 없음: ${HSK_RAW}`); process.exit(1); }
  if (!fs.existsSync(CEDICT_PATH)) { console.error(`❌ CC-CEDICT 없음: ${CEDICT_PATH}`); process.exit(1); }

  const wikitext = JSON.parse(fs.readFileSync(HSK_RAW, 'utf8')).parse.wikitext['*'];
  const hsk = parseHskTable(wikitext);
  console.log(`📖 HSK 1급: ${hsk.length}개 단어 파싱`);

  const cedict = loadCedict();
  console.log(`📚 CC-CEDICT: ${cedict.size}개 간체 표제어 인덱싱`);

  const source: SourceEntry[] = [];
  let matched = 0, missing = 0;
  const seen = new Set<string>();

  for (const w of hsk) {
    const key = `${w.term}|${w.pinyin}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const cands = cedict.get(w.term);
    let definition = '';
    if (cands && cands.length) {
      matched++;
      // 병음(성조부호 제거 후 소문자 비교)이 일치하는 항목 우선
      const norm = (s: string) => s.toLowerCase().replace(/[1-5\s]/g, '').normalize('NFD').replace(/[̀-ͯ]/g, '');
      const same = cands.find(c => norm(c.pinyin) === norm(w.pinyin));
      definition = cleanDef((same ?? cands[0]).defs);
    } else {
      missing++;
    }

    source.push({
      rank: source.length + 1,
      term: w.term,
      traditional: w.trad,
      reading: w.pinyin,
      pos: mapPos(w.pos),
      definition,
      category: w.category,
    });
  }

  console.log(`✅ ${source.length}개 추출 (CC-CEDICT 매칭 ${matched}, 미매칭 ${missing})`);
  fs.writeFileSync(OUTPUT, JSON.stringify(source, null, 2));
  console.log(`💾 ${OUTPUT}`);

  const noDef = source.filter(s => !s.definition);
  if (noDef.length) console.log(`⚠️ 정의 없음 ${noDef.length}개:`, noDef.slice(0, 10).map(s => s.term).join(' '));
}

main();
