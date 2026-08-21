/**
 * 한국어 학습 사다리 4덱을 constants/curationData.ts 에 반영한다.
 *
 * 입력
 *   scripts/ko-ladder-source.json      표제어 배치 (build-ko-ladder-source.ts)
 *   scripts/ko-ladder-translated.json  신규 카드 (translate-ko-ladder-vocab.ts)
 *   constants/curationData.ts          기존 3덱 — 카드 1,482개를 여기서 재사용한다
 *
 * 🔑 기존 카드를 그대로 옮기는 이유: 이미 같은 프롬프트로 만들어 검수까지 거친
 *    산출물이고, 다시 만들면 뜻·예문이 바뀌어 이미 학습 중인 사용자의 카드와
 *    어긋난다. **덱이 바뀌는 것은 표제어의 배치이지 카드 내용이 아니다.**
 *
 * definition(한국어 뜻풀이)은 신규 카드에서 빈칸으로 둔다. 채우는 것은 서버 시딩의
 * 몫이다(scripts/seed-official-decks.ts 가 enrich_cache 에서 가져온다). 🔴 절대
 * meaningKr 을 복사해 채우지 말 것 — 상세 화면이 "Korean definition" 자리에 영어를
 * 그대로 되풀이하던 결함(레딧 제보 ④)이 바로 그 복사였다.
 *
 * 실행: npx ts-node -P tsconfig.scripts.json scripts/integrate-ko-ladder.ts [--dry-run]
 */
import fs from 'fs';
import path from 'path';
import type { VocaList, Word } from '../lib/types';

const DRY = process.argv.includes('--dry-run');
const ROOT = process.cwd();
const CURATION_PATH = path.resolve(ROOT, 'constants/curationData.ts');
const LADDER_PATH = path.resolve(ROOT, 'scripts/ko-ladder-source.json');
const TRANSLATED_PATH = path.resolve(ROOT, 'scripts/ko-ladder-translated.json');

type DeckKey = 'basic' | 'inter1' | 'inter2' | 'advanced';

interface LadderEntry { rank: number; origRank: number; term: string; pos: string; grade: string }
interface LadderDeck { key: DeckKey; deckId: string; entries: LadderEntry[] }
interface Translated {
  deck: DeckKey; term: string; pos: string; grade: string; rank: number;
  meaningEn: string; romaja: string; exampleKo: string; exampleEn: string; usedForm: string;
}

/** 옛 덱 id — 카드를 여기서 걷어 온다. */
const LEGACY_IDS = ['curated-ko-basic-1', 'curated-ko-intermediate-1', 'curated-ko-advanced-1'];

/**
 * 덱 메타. 설명에서 **TOPIK 급수 참칭을 걷어냈다.**
 *
 * 옛 설명은 "Advanced Korean 500 … (TOPIK II 5-6)" 이라고 적어, 표제어가 TOPIK
 * 5-6급 어휘 목록에서 온 것처럼 읽혔다. 실제 출처는 NIKL(국립국어원) 학습용 어휘
 * 목록의 등급이고 TOPIK 급수와 대응하지 않는다. 영어권 학습자가 "TOPIK 5-6이라면서
 * 초급 단어가 나온다"고 제보한 것은 이 표기 때문이기도 하다.
 *
 * TOPIK 은 **예문 난이도**를 말할 때만 남긴다 — 그건 사실이다(프롬프트가 급수별
 * 문법으로 예문을 쓰게 한다). 태그의 'TOPIK' 도 같은 이유로 'NIKL' 로 바꾼다.
 *
 * CC BY-SA 4.0 출처 표기는 라이선스 의무라 형태를 유지한다.
 */
const META: Record<DeckKey, {
  id: string; title: string; category: string; level: string; tag: string; description: string;
}> = {
  basic: {
    id: 'curated-ko-basic-1',
    title: 'Basic Korean (for English speakers)',
    category: '기초', level: 'beginner', tag: 'Foundation',
    description:
      'Every headword the National Institute of the Korean Language grades A (beginner) — the complete grade, not a truncated sample. '
      + 'Sorted by frequency, so the most useful words come first. '
      + 'Source: NIKL learner vocabulary list via Wiktionary "Basic Korean Vocabulary List" (CC BY-SA 4.0). '
      + 'English meanings and TOPIK 1-2 level example sentences are AI-generated.',
  },
  inter1: {
    id: 'curated-ko-intermediate-1',
    title: 'Intermediate Korean I (for English speakers)',
    category: '중급', level: 'intermediate', tag: 'Intermediate',
    description:
      'The first half of NIKL grade B (intermediate), plus the grade-C words that are common enough to meet at this stage (그녀, 따라서, 오히려). '
      + 'Sorted by frequency. Continue with Intermediate Korean II. '
      + 'Source: NIKL learner vocabulary list via Wiktionary "Basic Korean Vocabulary List" (CC BY-SA 4.0). '
      + 'English meanings and TOPIK 3-4 level example sentences are AI-generated.',
  },
  inter2: {
    id: 'curated-ko-intermediate-2',
    title: 'Intermediate Korean II (for English speakers)',
    category: '중급', level: 'intermediate', tag: 'Intermediate',
    description:
      'The second half of NIKL grade B (intermediate) — the less frequent half, which no deck covered before. '
      + 'Start with Intermediate Korean I. '
      + 'Source: NIKL learner vocabulary list via Wiktionary "Basic Korean Vocabulary List" (CC BY-SA 4.0). '
      + 'English meanings and TOPIK 3-4 level example sentences are AI-generated.',
  },
  advanced: {
    id: 'curated-ko-advanced-1',
    title: 'Advanced Korean (for English speakers)',
    category: '고급', level: 'advanced', tag: 'Advanced',
    description:
      'NIKL grade C (advanced), excluding the most frequent ones — those are taught in the Intermediate decks, so this deck starts where they end. '
      + 'These are the words of news, academic writing and abstract argument. '
      + 'Source: NIKL learner vocabulary list via Wiktionary "Basic Korean Vocabulary List" (CC BY-SA 4.0). '
      + 'English meanings and TOPIK 5-6 level example sentences are AI-generated.',
  },
};

const ORDER: DeckKey[] = ['basic', 'inter1', 'inter2', 'advanced'];

function readDecks(src: string): VocaList[] {
  return JSON.parse(src.slice(src.indexOf('= [') + 2, src.lastIndexOf(']') + 1));
}

/**
 * 로마자에서 `-하다` 앞 거센소리 축약을 되살린다. 생각하다 → saenggakhada ✗ / saenggakada ○
 *
 * 국어의 로마자 표기법 제3장 제1항 붙임 — ㄱ·ㄷ·ㅂ 뒤에 ㅎ이 오면 거센소리로 적는다
 * (밝혀 적는 예외는 **체언**에 한한다). `-하다` 용언은 축약이 맞다.
 *
 * 🔑 AI 가 이걸 무작위로 틀린다. 실측: 기존 카드의 같은 패턴 21개 중 9개는 맞고
 *    12개가 틀렸다 — 체계적 오류가 아니라 temperature 흔들림이라, 모델을 바꾸거나
 *    다시 생성해도 낫지 않는다. 규칙이 명확하니 생성 뒤에 고정한다.
 */
export function fixRomajaAspiration(romaja: string, term: string): string {
  if (!romaja || !/하다$/.test(term)) return romaja;
  return romaja.replace(/([kpt])h(ada)$/, '$1$2');
}

export function buildWord(
  entry: LadderEntry, deckKey: DeckKey, index: number, createdAt: number,
  legacy: Word | undefined, fresh: Translated | undefined,
): Word | null {
  const tags = ['Korean', 'NIKL', META[deckKey].tag];
  const id = `word-ko-${deckKey}-${index}-${createdAt}`;

  if (legacy) {
    // 카드 내용은 손대지 않는다. 바뀌는 것은 소속 덱을 나타내는 것들과, 규칙으로
    // 판정되는 로마자 축약뿐이다(뜻·예문은 그대로 — 이미 검수를 거친 산출물이다).
    return { ...legacy, id, tags, phonetic: fixRomajaAspiration(legacy.phonetic ?? '', legacy.term) };
  }
  if (!fresh) return null;
  return {
    id,
    term: entry.term,
    definition: '',                 // 서버 시딩이 enrich_cache 에서 채운다
    meaningKr: fresh.meaningEn,
    exampleEn: fresh.exampleKo,     // ⚠️ 필드 이름이 거짓이다 — exampleEn 이 출발어(한국어) 예문이다
    exampleKr: fresh.exampleEn,     //    앱 코드 459곳이 이 이름을 쓰고 있어 유지한다
    isMemorized: false,
    isStarred: false,
    tags,
    phonetic: fixRomajaAspiration(fresh.romaja, entry.term),
    pos: fresh.pos || entry.pos,
  } as Word;
}

function main() {
  for (const p of [LADDER_PATH, TRANSLATED_PATH]) {
    if (!fs.existsSync(p)) { console.error(`❌ 없음: ${p}`); process.exit(1); }
  }
  const ladder: { decks: LadderDeck[] } = JSON.parse(fs.readFileSync(LADDER_PATH, 'utf8'));
  const translated: Translated[] = JSON.parse(fs.readFileSync(TRANSLATED_PATH, 'utf8'));
  const freshByTerm = new Map(translated.map(t => [t.term, t]));

  const src = fs.readFileSync(CURATION_PATH, 'utf8');
  const decks = readDecks(src);

  // 옛 3덱에서 카드를 걷는다(같은 표제어가 둘에 있으면 먼저 만난 것을 쓴다 — 중복 18건).
  const legacyByTerm = new Map<string, Word>();
  const legacyMeta = new Map<string, VocaList>();
  for (const id of LEGACY_IDS) {
    const d = decks.find(x => x.id === id);
    if (!d) { console.error(`❌ 옛 덱 없음: ${id}`); process.exit(1); }
    legacyMeta.set(id, d);
    for (const w of d.words) if (!legacyByTerm.has(w.term)) legacyByTerm.set(w.term, w);
  }
  console.log(`📂 옛 카드 ${legacyByTerm.size}개 · 신규 번역 ${translated.length}개`);

  const built: VocaList[] = [];
  let reused = 0, madeNew = 0;
  const missing: string[] = [];

  for (const key of ORDER) {
    const deck = ladder.decks.find(d => d.key === key)!;
    const meta = META[key];
    const createdAt = legacyMeta.get(meta.id)?.createdAt ?? Date.now();
    const words: Word[] = [];

    for (let i = 0; i < deck.entries.length; i++) {
      const e = deck.entries[i];
      const legacy = legacyByTerm.get(e.term);
      const w = buildWord(e, key, i, createdAt, legacy, freshByTerm.get(e.term));
      if (!w) { missing.push(`${key}:${e.term}`); continue; }
      if (legacy) reused++; else madeNew++;
      words.push(w);
    }

    built.push({
      id: meta.id,
      title: meta.title,
      icon: '🇰🇷',
      isCurated: true,
      category: meta.category,
      level: meta.level,
      description: meta.description,
      sourceLanguage: 'ko',
      targetLanguage: 'en',
      isVisible: true,
      createdAt,
      words,
    } as VocaList);

    console.log(`  ${meta.id.padEnd(28)} ${String(words.length).padStart(4)}개  "${meta.title}"`);
  }

  if (missing.length) {
    console.error(`\n❌ 카드를 못 만든 표제어 ${missing.length}개 — 번역이 덜 끝났습니다.`);
    console.error('   ' + missing.slice(0, 20).join(' '));
    console.error('   translate-ko-ladder-vocab.ts 를 마저 돌린 뒤 다시 실행하세요.');
    process.exit(1);
  }
  console.log(`\n재사용 ${reused} · 신규 ${madeNew} · 합계 ${reused + madeNew}`);

  // 옛 3덱을 새 4덱으로 갈아 끼운다. 첫 옛 덱이 있던 자리에 넣어 목록 순서를 지킨다.
  const firstIdx = decks.findIndex(d => LEGACY_IDS.includes(d.id));
  const kept = decks.filter(d => !LEGACY_IDS.includes(d.id));
  kept.splice(firstIdx, 0, ...built);

  if (DRY) { console.log('\n--dry-run: 파일을 쓰지 않았습니다.'); return; }
  // 🔴 이 파일은 CRLF 다. LF 로 쓰면 8.7MB 전 줄이 바뀐 것으로 표시돼 실제 변경을
  //    볼 수 없다. JSON 문자열 값 안의 개행은 이미 \\n 으로 이스케이프돼 있으므로
  //    직렬화 결과를 통째로 치환해도 데이터는 건드리지 않는다.
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  const body = `import { VocaList } from '@/lib/types';\n\nexport const curationPresets: VocaList[] = ${JSON.stringify(kept, null, 2)};\n`;
  fs.writeFileSync(CURATION_PATH, eol === '\n' ? body : body.replace(/\n/g, eol));
  console.log(`\n✅ ${CURATION_PATH} — 총 ${kept.length}덱`);
}

if (require.main === module) main();
