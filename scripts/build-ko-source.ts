/**
 * 한국어 초급(외국인 학습자용, ko→en) 단어 소스 빌더.
 *
 * 출처: Wiktionary "Appendix:Basic Korean Vocabulary List" (+/500, /1000)
 *   — NIKL(국립국어원) 한국어 학습용 어휘목록 빈도순, CC BY-SA 4.0
 *
 * 사전 준비:
 *   curl "https://en.wiktionary.org/w/api.php?action=parse&page=Appendix:Basic_Korean_Vocabulary_List&format=json&prop=wikitext" -o scripts/data/wiktionary-kobasic-raw.json
 *   curl "...page=Appendix:Basic_Korean_Vocabulary_List%2F500..."  -o scripts/data/wiktionary-kobasic-500.json
 *   curl "...page=Appendix:Basic_Korean_Vocabulary_List%2F1000..." -o scripts/data/wiktionary-kobasic-1000.json
 *
 * 실행: npx ts-node scripts/build-ko-source.ts
 * 출력: scripts/ko-source.json (영어 뜻은 비움 — Gemini가 생성)
 */
import fs from 'fs';
import path from 'path';

const FILES = [
  'scripts/data/wiktionary-kobasic-raw.json',
  'scripts/data/wiktionary-kobasic-500.json',
  'scripts/data/wiktionary-kobasic-1000.json',
];
const OUTPUT = path.resolve(process.cwd(), 'scripts/ko-source.json');
const TARGET_COUNT = 500;

// 한글 품사약자 → 영어. 포함 대상만 매핑(제외 품사는 미등록).
const POS_MAP: Record<string, string> = {
  '명': 'noun', '동': 'verb', '형': 'adjective', '부': 'adverb',
  '대': 'pronoun', '감': 'interjection', '수': 'numeral',
};
// 기능어로 제외: 의(의존명사) 보(보조용언) 관(관형사) 불(분류외) 조(조사) 접(접사)
const EXCLUDE_POS = new Set(['의', '보', '관', '불', '조', '접']);

interface SourceEntry {
  rank: number;
  term: string;
  pos: string;        // 영어 품사
  grade: string;      // A/B/C (NIKL 난이도)
  definition: string; // '' — Gemini가 채움
  category: string;   // 품사 기반 그룹
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

  // 기능어 제외 + 동일 표제어 중복 제거(최고 빈도=최저 rank 우선) + 등급 A 우선
  const byTerm = new Map<string, typeof raw[0]>();
  for (const e of raw) {
    if (EXCLUDE_POS.has(e.posAbbr)) continue;
    if (!POS_MAP[e.posAbbr]) continue;
    if (!byTerm.has(e.term)) byTerm.set(e.term, e); // rank 오름차순이므로 첫 등장이 최고빈도
  }
  const filtered = [...byTerm.values()];
  console.log(`🔍 기능어 제외 + 중복 제거 후: ${filtered.length}개`);

  // 등급 A > B > C 순, 동일 등급 내 빈도(rank) 순
  const gradeRank: Record<string, number> = { A: 0, B: 1, C: 2 };
  filtered.sort((a, b) => (gradeRank[a.grade] - gradeRank[b.grade]) || (a.rank - b.rank));

  const picked = filtered.slice(0, TARGET_COUNT);
  // 최종 출력은 다시 빈도순(rank)으로 정렬 — 학습 순서를 빈도 기반으로
  picked.sort((a, b) => a.rank - b.rank);

  const source: SourceEntry[] = picked.map((e, i) => ({
    rank: i + 1,
    term: e.term,
    pos: POS_MAP[e.posAbbr],
    grade: e.grade,
    definition: '',
    category: POS_MAP[e.posAbbr],
  }));

  fs.writeFileSync(OUTPUT, JSON.stringify(source, null, 2));
  console.log(`✅ ${source.length}개 추출 → ${OUTPUT}`);

  const posCount: Record<string, number> = {};
  const gradeCount: Record<string, number> = {};
  for (const s of source) { posCount[s.pos] = (posCount[s.pos] ?? 0) + 1; }
  for (const e of picked) { gradeCount[e.grade] = (gradeCount[e.grade] ?? 0) + 1; }
  console.log('📊 품사 분포:', posCount);
  console.log('📊 등급 분포:', gradeCount);
  console.log('샘플:', source.slice(0, 12).map(s => `${s.term}(${s.pos})`).join(', '));
}

main();
