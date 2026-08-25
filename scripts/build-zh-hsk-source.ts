/**
 * 중국어 HSK 3급/5급 단어 소스 빌더 (중급/고급).
 *
 * 출처(CC BY-SA 4.0):
 *   - Wiktionary "Appendix:HSK_list_of_Mandarin_words_v3.0/level_{3|5}"
 *   - CC-CEDICT — 영어 정의
 *
 * 사전 준비:
 *   Invoke-WebRequest ".../level_3..." -OutFile scripts/data/wiktionary-hsk3-raw.json
 *   Invoke-WebRequest ".../level_5..." -OutFile scripts/data/wiktionary-hsk5-raw.json
 *
 * 실행:
 *   npx ts-node scripts/build-zh-hsk-source.ts 3
 *   npx ts-node scripts/build-zh-hsk-source.ts 5
 * 출력: scripts/zh-intermediate-source.json | scripts/zh-advanced-source.json
 *
 * 선정: 페이지 등장 순서(monosyllabic→disyllabic) 상위 500. HSK 페이지는 빈도순이 아닌
 * 음절 그룹+병음 순이라, 첫 500은 monosyllabic 위주(고기본어휘 분포)가 됨.
 */
import fs from 'fs';
import path from 'path';

const LEVEL = (process.argv[2] || '').trim();
if (!['3', '5'].includes(LEVEL)) {
  console.error('❌ 사용법: npx ts-node scripts/build-zh-hsk-source.ts <3|5> [개수]');
  process.exit(1);
}

const OUT_NAME = LEVEL === '3' ? 'zh-intermediate' : 'zh-advanced';
const HSK_RAW = path.resolve(process.cwd(), `scripts/data/wiktionary-hsk${LEVEL}-raw.json`);
const CEDICT_PATH = path.resolve(process.cwd(), 'scripts/data/cedict.txt');
const OUTPUT = path.resolve(process.cwd(), `scripts/${OUT_NAME}-source.json`);
// 🔴 500 으로 자르지 않는다 — 자를 좋은 축이 아예 없기 때문이다.
//    HSK 위키 페이지는 빈도순이 아니라 **음절 그룹 + 병음 순**이고 CC-CEDICT 에도 빈도가
//    없다. 그래서 앞에서 500을 자르면 "쉬운 500"이 아니라 **단음절 전량 + 2음절 a~j** 가
//    남는다. 2026-08 실측으로 3급 469장 · 5급 570장이 그렇게 잘려 나가 있었다.
//    ⚠️ "어떻게 자를까"가 아니라 **"자를 데이터가 있나"를 먼저 물을 것.** 사다리 4덱도
//    같은 질문에서 같은 결론(자르지 않는다)에 왔다.
//    줄여야 할 이유가 생기면 두 번째 인자로 개수를 준다.
const TARGET_COUNT = process.argv[3] ? Number(process.argv[3]) : Number.POSITIVE_INFINITY;

const POS_MAP: Record<string, string> = {
  V: 'verb', N: 'noun', A: 'adjective', Num: 'number', Part: 'particle',
  Cl: 'classifier', Adv: 'adverb', Prep: 'preposition', Conj: 'conjunction',
  Pron: 'pronoun', Pref: 'prefix', Suf: 'suffix', Int: 'interjection',
  Aux: 'auxiliary', M: 'classifier', Mod: 'modal',
};

interface SourceEntry {
  rank: number;
  term: string;
  traditional: string;
  reading: string;
  pos: string;
  definition: string;
  category: string;
}

interface CedictEntry { trad: string; simp: string; pinyin: string; defs: string[] }

function mapPos(raw: string): string {
  const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
  const seen = new Set<string>();
  for (const p of parts) {
    const m = POS_MAP[p];
    if (m) seen.add(m);
  }
  return [...seen].join(', ') || raw.trim();
}

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
  const useful = defs.filter(d =>
    !/^(variant of|see |old variant|abbr\. for|surname )/i.test(d) &&
    !d.startsWith('CL:') &&
    !/^\(/.test(d),
  );
  return (useful.length ? useful : defs).slice(0, 3).join('; ');
}

function parseHskTable(wikitext: string) {
  const rows: { term: string; trad: string; pinyin: string; pos: string; category: string }[] = [];
  const lines = wikitext.split('\n');
  let category = '';

  for (const raw of lines) {
    const line = raw.trim();
    const h3 = line.match(/^===([^=]+)===$/);
    if (h3) { category = h3[1].trim(); continue; }

    if (!line.startsWith('|') || line.startsWith('|-') || line.startsWith('|+') || line.startsWith('|}')) continue;
    if (line.startsWith('!')) continue;

    const cells = line.replace(/^\|/, '').split('||').map(c => c.trim());
    if (cells.length < 4) continue;

    const delink = (s: string) => s.replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '$1').trim();
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
  console.log(`📖 HSK ${LEVEL}급: ${hsk.length}개 파싱`);

  const cedict = loadCedict();
  console.log(`📚 CC-CEDICT: ${cedict.size}개 표제어`);

  const seen = new Set<string>();
  const deduped: typeof hsk = [];
  for (const w of hsk) {
    const key = `${w.term}|${w.pinyin}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(w);
  }
  console.log(`🔍 중복 제거: ${deduped.length}개`);

  // 개수를 명시했을 때만 부족 검사가 의미가 있다. 기본(전량)에서는 후보가 곧 목표다.
  if (Number.isFinite(TARGET_COUNT) && deduped.length < TARGET_COUNT) {
    console.error(`❌ 후보 ${deduped.length}개 (목표 ${TARGET_COUNT})`);
    process.exit(1);
  }

  const picked = deduped.slice(0, TARGET_COUNT);
  const source: SourceEntry[] = [];
  let matched = 0, missing = 0;

  for (const w of picked) {
    const cands = cedict.get(w.term);
    let definition = '';
    if (cands && cands.length) {
      matched++;
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
      category: `HSK ${LEVEL} > ${w.category}`,
    });
  }

  fs.writeFileSync(OUTPUT, JSON.stringify(source, null, 2));
  console.log(`✅ ${source.length}개 추출 (CC-CEDICT 매칭 ${matched}, 미매칭 ${missing}) → ${OUTPUT}`);
  const noDef = source.filter(s => !s.definition);
  if (noDef.length) console.log(`⚠️ 정의 없음 ${noDef.length}개:`, noDef.slice(0, 10).map(s => s.term).join(' '));
  console.log('샘플(앞 10):', source.slice(0, 10).map(s => `${s.term}(${s.reading})`).join(', '));
  console.log('샘플(뒤 5):', source.slice(-5).map(s => `${s.term}(${s.reading})`).join(', '));
}

main();
