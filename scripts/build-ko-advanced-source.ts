/**
 * 한국어 고급(외국인 학습자용, ko→en) 단어 소스 빌더.
 *
 * 출처: Wiktionary "Appendix:Basic Korean Vocabulary List" (raw, /500, /1000, /1500, /2000, /3000)
 *   — NIKL(국립국어원) 한국어 학습용 어휘목록 빈도순, CC BY-SA 4.0
 *   — 등급 C만 추출 (≈ TOPIK II 5~6급 고급)
 *
 * Basic(등급 A) → Intermediate(등급 B) → Advanced(등급 C) 시리즈 완결.
 *
 * 사전 준비:
 *   curl ".../Appendix:Basic_Korean_Vocabulary_List%2F1500..." -o scripts/data/wiktionary-kobasic-1500.json
 *   curl ".../Appendix:Basic_Korean_Vocabulary_List%2F2000..." -o scripts/data/wiktionary-kobasic-2000.json
 *   curl ".../Appendix:Basic_Korean_Vocabulary_List%2F3000..." -o scripts/data/wiktionary-kobasic-3000.json
 *
 * 실행: npx ts-node scripts/build-ko-advanced-source.ts
 * 출력: scripts/ko-advanced-source.json
 */
import fs from 'fs';
import path from 'path';

const FILES = [
  'scripts/data/wiktionary-kobasic-raw.json',
  'scripts/data/wiktionary-kobasic-500.json',
  'scripts/data/wiktionary-kobasic-1000.json',
  'scripts/data/wiktionary-kobasic-1500.json',
  'scripts/data/wiktionary-kobasic-2000.json',
  'scripts/data/wiktionary-kobasic-3000.json',
];
const OUTPUT = path.resolve(process.cwd(), 'scripts/ko-advanced-source.json');
const TARGET_COUNT = 500;
const TARGET_GRADE = 'C';

const POS_MAP: Record<string, string> = {
  '명': 'noun', '동': 'verb', '형': 'adjective', '부': 'adverb',
  '대': 'pronoun', '감': 'interjection', '수': 'numeral',
};
const EXCLUDE_POS = new Set(['의', '보', '관', '불', '조', '접']);

interface SourceEntry {
  rank: number;
  origRank: number;
  term: string;
  pos: string;
  grade: string;
  definition: string;
  category: string;
}

function main() {
  const re = /^\*(\d+)\.\s*\{\{ko-linker\|([^|}]+)\|([^|}]+)\}\}\s*-\s*([ABC])/;
  const raw: { rank: number; term: string; posAbbr: string; grade: string }[] = [];

  for (const f of FILES) {
    const p = path.resolve(process.cwd(), f);
    if (!fs.existsSync(p)) { console.error(`❌ 없음: ${f}`); process.exit(1); }
    const wt = JSON.parse(fs.readFileSync(p, 'utf8')).parse.wikitext['*'];
    for (const line of wt.split('\n')) {
      const m = line.trim().match(re);
      if (!m) continue;
      raw.push({ rank: Number(m[1]), term: m[2].trim(), posAbbr: m[3].trim(), grade: m[4] });
    }
  }
  raw.sort((a, b) => a.rank - b.rank);
  console.log(`📖 Wiktionary Basic Korean: ${raw.length}개 파싱`);

  const byTerm = new Map<string, typeof raw[0]>();
  for (const e of raw) {
    if (EXCLUDE_POS.has(e.posAbbr)) continue;
    if (!POS_MAP[e.posAbbr]) continue;
    if (!byTerm.has(e.term)) byTerm.set(e.term, e);
  }

  const cOnly = [...byTerm.values()].filter(e => e.grade === TARGET_GRADE);
  console.log(`🔍 기능어 제외 + 중복 제거 + 등급 C 필터 후: ${cOnly.length}개`);

  if (cOnly.length < TARGET_COUNT) {
    console.error(`❌ C 등급 후보가 ${cOnly.length}개라 ${TARGET_COUNT}개에 부족. /4000, /5000 추가 fetch 필요.`);
    process.exit(1);
  }

  cOnly.sort((a, b) => a.rank - b.rank);
  const picked = cOnly.slice(0, TARGET_COUNT);

  const source: SourceEntry[] = picked.map((e, i) => ({
    rank: i + 1,
    origRank: e.rank,
    term: e.term,
    pos: POS_MAP[e.posAbbr],
    grade: e.grade,
    definition: '',
    category: POS_MAP[e.posAbbr],
  }));

  fs.writeFileSync(OUTPUT, JSON.stringify(source, null, 2));
  console.log(`✅ ${source.length}개 추출 → ${OUTPUT}`);

  const posCount: Record<string, number> = {};
  for (const s of source) { posCount[s.pos] = (posCount[s.pos] ?? 0) + 1; }
  console.log('📊 품사 분포:', posCount);
  console.log(`📊 origRank 범위: ${source[0].origRank} ~ ${source[source.length - 1].origRank}`);
  console.log('샘플(앞 12):', source.slice(0, 12).map(s => `${s.term}(${s.pos})`).join(', '));
  console.log('샘플(뒤 8):', source.slice(-8).map(s => `${s.term}(${s.pos})`).join(', '));
}

main();
