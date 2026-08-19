/**
 * 한국어 학습 사다리 4덱(외국인 학습자용, ko→en)의 표제어를 한 번에 고른다.
 *
 * 출처: Wiktionary "Appendix:Basic Korean Vocabulary List" (raw, /500 … /3000)
 *   — NIKL(국립국어원) 한국어 학습용 어휘목록 빈도순, CC BY-SA 4.0
 *
 * 이 스크립트가 대체하는 것: build-ko-source.ts · build-ko-intermediate-source.ts ·
 * build-ko-advanced-source.ts. 셋을 따로 돌리던 구조가 아래 세 결함을 만들었다.
 *
 *   ① **등급 안에서 빈도 상위 500을 잘랐다.** 빈도 상위 = 가장 흔한 = 가장 쉬운이라
 *      "고급 500"이 실제로는 "고급 등급 중 가장 쉬운 500"이었다. 영어권 학습자가
 *      Advanced 덱 첫 화면에서 그녀(빈도 69위)·정부(136)·과정(188)을 보고
 *      "난이도가 지나치게 섞였다"고 제보한 것이 이 절단의 결과다.
 *   ② **Basic·Intermediate 는 입력 파일 6개 중 3개만 읽었다**(rank ~1500까지).
 *      rank 1500 이후의 A등급 205개는 후보에 오른 적이 없고, A가 모자란 자리를
 *      B등급으로 메우다 Basic ∩ Intermediate 중복 18건이 생겼다.
 *   ③ 세 스크립트가 표제어 중복 제거를 각자 해서, 같은 단어가 어느 덱에 갈지가
 *      실행 순서에 달려 있었다.
 *
 * 새 규칙 — 자르지 않는다. 후보 풀 3,173개를 네 덱이 빈틈없이 나눠 갖는다.
 *
 *   Basic          A등급 전량
 *   Intermediate ① ┐ B등급 전량 + C등급 중 빈도 상위(rank < ADVANCED_MIN_RANK)를
 *   Intermediate ② ┘ 합쳐 빈도순으로 정렬한 뒤 반으로 나눈 것
 *   Advanced       C등급 중 rank >= ADVANCED_MIN_RANK
 *
 * 🔑 C등급인데 Intermediate 로 내려가는 단어가 있는 이유: NIKL 이 그녀·따라서·
 *    오히려를 C(고급)로 분류한 것은 문어체·번역투라는 판단이고 오류가 아니다.
 *    다만 빈도 69위 단어를 고급 덱 첫 장에 두면 학습자 체감과 어긋난다. 그래서
 *    등급은 그대로 두되 **배치만 빈도로 내린다** — 어느 덱에서도 사라지지 않는다.
 *
 * 실행: npx ts-node -P tsconfig.scripts.json scripts/build-ko-ladder-source.ts
 * 출력: scripts/ko-ladder-source.json
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
const OUTPUT = path.resolve(process.cwd(), 'scripts/ko-ladder-source.json');

/**
 * Advanced 의 빈도 하한. Intermediate 가 덮던 구간(옛 덱은 rank 24~1396)의 바로 뒤다.
 * 이 값이 곧 "Advanced 첫 장에 무엇이 보이는가"를 정한다 — 1400 이면 사례·추진하다·
 * 틀·평균으로 시작하고, 그 앞의 C등급 206개는 Intermediate 로 내려간다.
 */
const ADVANCED_MIN_RANK = 1400;

const POS_MAP: Record<string, string> = {
  '명': 'noun', '동': 'verb', '형': 'adjective', '부': 'adverb',
  '대': 'pronoun', '감': 'interjection', '수': 'numeral',
};
// 조사·어미·관형사 등 기능어. 단독 카드로 외울 대상이 아니다.
const EXCLUDE_POS = new Set(['의', '보', '관', '불', '조', '접']);

const GRADE_ORDER: Record<string, number> = { A: 0, B: 1, C: 2 };

interface Candidate {
  rank: number;
  term: string;
  pos: string;
  grade: string;
}

export interface LadderEntry {
  rank: number;       // 덱 안 일련번호 (1..N)
  origRank: number;   // NIKL 빈도 순위
  term: string;
  pos: string;
  grade: string;
  definition: string;
  category: string;
}

export interface LadderDeck {
  key: 'basic' | 'inter1' | 'inter2' | 'advanced';
  deckId: string;
  entries: LadderEntry[];
}

/** 위키텍스트 6개 파일에서 (rank, term, 품사, 등급)을 긁어 표제어별로 하나만 남긴다. */
export function collectCandidates(wikitexts: string[]): Candidate[] {
  const re = /^\*(\d+)\.\s*\{\{ko-linker\|([^|}]+)\|([^|}]+)\}\}\s*-\s*([ABC])/;
  const raw: { rank: number; term: string; posAbbr: string; grade: string }[] = [];

  for (const wt of wikitexts) {
    for (const line of wt.split('\n')) {
      const m = line.trim().match(re);
      if (!m) continue;
      // 🔴 표제어에 NIKL 의 동음이의어 구분 번호가 붙어 온다 — `{{ko-linker|정성11|명}}`.
      //    떼지 않으면 학습자가 "정성11", "유리1" 이라고 적힌 카드를 보게 된다.
      //    옛 스크립트들은 이걸 몰랐고 다만 빈도 상위만 잘라 써서 걸리지 않았을 뿐이다
      //    (번호가 붙은 항목은 전부 빈도 3,000위 밖에 있다).
      //    떼고 나면 도1·도11 → 도, 상23·상25 → 상 처럼 합쳐진다. 중복 제거가 받는다.
      const term = m[2].trim().replace(/\d+$/, '');
      if (!term) continue;
      raw.push({ rank: Number(m[1]), term, posAbbr: m[3].trim(), grade: m[4] });
    }
  }
  raw.sort((a, b) => a.rank - b.rank);

  // 같은 표제어가 여러 행으로 나온다(품사·의미가 갈린 경우, 있다 3위/4위처럼).
  // 🔑 등급이 갈릴 때는 **낮은 등급을 채택**한다 — 학습자는 그 단어를 먼저 만나는
  //    단계에서 배우면 되고, 이렇게 해야 한 단어가 두 덱에 실리지 않는다.
  //    (옛 스크립트들은 각자 "먼저 본 행"을 남겨 배치가 실행 순서에 달려 있었다.)
  const byTerm = new Map<string, Candidate>();
  for (const e of raw) {
    if (EXCLUDE_POS.has(e.posAbbr)) continue;
    const pos = POS_MAP[e.posAbbr];
    if (!pos) continue;
    const prev = byTerm.get(e.term);
    if (!prev || GRADE_ORDER[e.grade] < GRADE_ORDER[prev.grade]) {
      byTerm.set(e.term, { rank: e.rank, term: e.term, pos, grade: e.grade });
    }
  }
  return [...byTerm.values()].sort((a, b) => a.rank - b.rank);
}

/** 후보 풀을 네 덱으로 나눈다. 어느 덱에도 안 들어가는 단어가 없어야 한다. */
export function splitLadder(pool: Candidate[]): LadderDeck[] {
  const byRank = (a: Candidate, b: Candidate) => a.rank - b.rank;
  const basic = pool.filter(e => e.grade === 'A').sort(byRank);
  const advanced = pool.filter(e => e.grade === 'C' && e.rank >= ADVANCED_MIN_RANK).sort(byRank);
  const interPool = pool
    .filter(e => e.grade === 'B' || (e.grade === 'C' && e.rank < ADVANCED_MIN_RANK))
    .sort(byRank);

  const half = Math.ceil(interPool.length / 2);
  const packs: [LadderDeck['key'], string, Candidate[]][] = [
    ['basic', 'curated-ko-basic-1', basic],
    ['inter1', 'curated-ko-intermediate-1', interPool.slice(0, half)],
    ['inter2', 'curated-ko-intermediate-2', interPool.slice(half)],
    ['advanced', 'curated-ko-advanced-1', advanced],
  ];

  return packs.map(([key, deckId, list]) => ({
    key,
    deckId,
    entries: list.map((e, i) => ({
      rank: i + 1,
      origRank: e.rank,
      term: e.term,
      pos: e.pos,
      grade: e.grade,
      definition: '',
      category: e.pos,
    })),
  }));
}

function main() {
  const wikitexts = FILES.map(f => {
    const p = path.resolve(process.cwd(), f);
    if (!fs.existsSync(p)) { console.error(`❌ 없음: ${f}`); process.exit(1); }
    return JSON.parse(fs.readFileSync(p, 'utf8')).parse.wikitext['*'] as string;
  });

  const pool = collectCandidates(wikitexts);
  const grades: Record<string, number> = {};
  for (const e of pool) grades[e.grade] = (grades[e.grade] ?? 0) + 1;
  console.log(`📖 후보 풀 ${pool.length}개 — 등급별 ${JSON.stringify(grades)}`);

  const decks = splitLadder(pool);

  // 배치 검증: 빠진 단어도 두 번 실린 단어도 없어야 한다.
  const placed = new Map<string, string[]>();
  for (const d of decks) {
    for (const e of d.entries) {
      if (!placed.has(e.term)) placed.set(e.term, []);
      placed.get(e.term)!.push(d.key);
    }
  }
  const dup = [...placed.entries()].filter(([, ks]) => ks.length > 1);
  const missing = pool.filter(e => !placed.has(e.term));
  if (dup.length || missing.length) {
    console.error(`❌ 배치 오류 — 중복 ${dup.length}건, 누락 ${missing.length}건`);
    if (dup.length) console.error('   중복:', dup.slice(0, 10).map(([t, ks]) => `${t}(${ks.join('+')})`).join(' '));
    if (missing.length) console.error('   누락:', missing.slice(0, 10).map(e => e.term).join(' '));
    process.exit(1);
  }

  fs.writeFileSync(OUTPUT, JSON.stringify({ advancedMinRank: ADVANCED_MIN_RANK, decks }, null, 2));
  console.log(`✅ ${placed.size}개 배치 → ${OUTPUT}`);
  console.log('');

  for (const d of decks) {
    const g: Record<string, number> = {};
    for (const e of d.entries) g[e.grade] = (g[e.grade] ?? 0) + 1;
    const first = d.entries[0], last = d.entries[d.entries.length - 1];
    console.log(`### ${d.key.padEnd(8)} ${String(d.entries.length).padStart(5)}개  등급 ${JSON.stringify(g)}  빈도 ${first.origRank}~${last.origRank}`);
    console.log(`    앞 12: ${d.entries.slice(0, 12).map(e => e.term).join(' ')}`);
  }
}

if (require.main === module) main();
