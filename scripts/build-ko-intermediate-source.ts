/**
 * 한국어 중급(외국인 학습자용, ko→en) 단어 소스 빌더.
 *
 * 출처: Wiktionary "Appendix:Basic Korean Vocabulary List" (raw, /500, /1000)
 *   — NIKL(국립국어원) 한국어 학습용 어휘목록 빈도순, CC BY-SA 4.0
 *   — 등급 B만 추출 (≈ TOPIK II 3~4급 중급)
 *
 * Basic Korean 500(등급 A 위주) → Intermediate Korean 500(등급 B) → 향후 Advanced(등급 C) 연계.
 *
 * 사전 준비: build-ko-source.ts와 동일한 data 파일 재사용. 추가 fetch 불필요.
 *
 * 실행: npx ts-node scripts/build-ko-intermediate-source.ts
 * 출력: scripts/ko-intermediate-source.json
 */
import fs from 'fs';
import path from 'path';

const FILES = [
  'scripts/data/wiktionary-kobasic-raw.json',
  'scripts/data/wiktionary-kobasic-500.json',
  'scripts/data/wiktionary-kobasic-1000.json',
];
const OUTPUT = path.resolve(process.cwd(), 'scripts/ko-intermediate-source.json');
const TARGET_COUNT = 500;
const TARGET_GRADE = 'B';

const POS_MAP: Record<string, string> = {
  '명': 'noun', '동': 'verb', '형': 'adjective', '부': 'adverb',
  '대': 'pronoun', '감': 'interjection', '수': 'numeral',
};
const EXCLUDE_POS = new Set(['의', '보', '관', '불', '조', '접']);

interface SourceEntry {
  rank: number;       // 1..TARGET_COUNT (빈도 재정렬 후 일련번호)
  origRank: number;   // NIKL 원래 빈도 순위
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

  // 1) 기능어 제외, 2) 동일 표제어는 최저 rank(=최고빈도) 첫 등장만 유지,
  // 3) 등급 B만 남김. 등급은 표제어 기준 가장 빈번한 등장의 등급.
  const byTerm = new Map<string, typeof raw[0]>();
  for (const e of raw) {
    if (EXCLUDE_POS.has(e.posAbbr)) continue;
    if (!POS_MAP[e.posAbbr]) continue;
    if (!byTerm.has(e.term)) byTerm.set(e.term, e);
  }

  // Basic Korean 500 (등급 A 위주) 결과와의 중복도 방어: 빌더는 등급 B만 뽑으므로
  // 사실상 겹칠 일이 없지만, 한 표제어가 다른 위치에서 A로도 등장하는 케이스를 안전하게 컷.
  const bOnly = [...byTerm.values()].filter(e => e.grade === TARGET_GRADE);
  console.log(`🔍 기능어 제외 + 중복 제거 + 등급 B 필터 후: ${bOnly.length}개`);

  if (bOnly.length < TARGET_COUNT) {
    console.error(`❌ B 등급 후보가 ${bOnly.length}개라 ${TARGET_COUNT}개에 부족. /1500, /2000 데이터를 추가 fetch 필요.`);
    process.exit(1);
  }

  // 빈도(rank) 순 그대로 상위 N개 — 학습 순서가 빈도 기반이 되도록.
  bOnly.sort((a, b) => a.rank - b.rank);
  const picked = bOnly.slice(0, TARGET_COUNT);

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
