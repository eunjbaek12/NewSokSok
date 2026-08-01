/**
 * constants/curationData.ts 의 한국어 출발 덱 전체를 공용 규칙으로 훑는다.
 *
 * 새 덱을 만들 때는 translate 스크립트가 생성 직후에 같은 검사를 돌리지만, 이 도구는
 * 이미 통합·커밋된 덱까지 다시 본다. 규칙을 새로 추가했을 때(특히 로마자 자동 검증)
 * 예전 덱에 남아 있는 오류를 찾아내는 용도다.
 *
 * 도착어를 가리지 않는 이유: 처음에는 ko→en 만 봤는데, 같은 덱의 vi/ja/zh 판이
 * 로마자를 따로 생성해 두는 바람에 46건이 검사 밖에 숨어 있었다. 로마자·'당신'·예문
 * 중복은 도착어와 무관하므로 한국어가 출발어이기만 하면 전부 대상이다.
 *
 * 실행: npx ts-node -P tsconfig.scripts.json scripts/diagnose-ko-decks.ts
 * 옵션: --deck=<id 일부>  특정 덱만
 */
import fs from 'fs';
import path from 'path';
import { collectFindings, reportFindings, DeckEntry } from './lib/ko-deck-checks';

const deckArg = process.argv.find(a => a.startsWith('--deck='));
const DECK_FILTER = deckArg ? deckArg.split('=')[1] : '';

const CURATION_PATH = path.resolve(process.cwd(), 'constants/curationData.ts');
const src = fs.readFileSync(CURATION_PATH, 'utf8');
// `export const curationPresets: VocaList[] = [...]` 에서 배열만 떼어 파싱한다.
// indexOf('[')를 쓰면 VocaList[] 의 대괄호를 잡으므로 '= [' 를 찾아야 한다.
const decks: any[] = JSON.parse(src.slice(src.indexOf('= [') + 2, src.lastIndexOf(']') + 1));

const targets = decks.filter(d =>
  d.sourceLanguage === 'ko' && (!DECK_FILTER || d.id.includes(DECK_FILTER)));

if (!targets.length) {
  console.error(`❌ 대상 덱이 없습니다${DECK_FILTER ? ` (--deck=${DECK_FILTER})` : ''}`);
  process.exit(1);
}

console.log(`📚 한국어 출발 덱 ${targets.length}개 검사\n`);
let totalHard = 0;
let totalWords = 0;

for (const d of targets) {
  // 앱 슬롯 → 검사용 형태. 한국어 출발 덱은 뜻 슬롯이 도착어, 원어 예문 슬롯이 한국어다.
  const entries: DeckEntry[] = d.words.map((w: any) => ({
    term: w.term,
    romaja: w.phonetic,
    meaningEn: w.meaningKr,
    exampleKo: w.exampleEn,
    exampleEn: w.exampleKr,
  }));
  // ko→ko(맞춤법·유행어 풀이)는 한국어 사용자용이라 로마자 슬롯이 비어 있는 게 정상이다.
  const targetIsKorean = d.targetLanguage === 'ko';
  const findings = collectFindings(entries, { targetIsKorean, skipRomaja: targetIsKorean });
  const hard = findings.filter(f => !f.advisory);
  totalWords += entries.length;
  totalHard += hard.length;

  const label = `${d.title} [ko→${d.targetLanguage}] (${entries.length}단어)`;
  if (!findings.length) {
    console.log(`✅ ${label}`);
    continue;
  }
  console.log(`\n──── ${label} ────`);
  reportFindings(findings, entries.length);
}

console.log(`\n${'='.repeat(50)}`);
console.log(`전체 ${targets.length}개 덱 / ${totalWords}단어 — 확실한 문제 ${totalHard}건`);
process.exit(totalHard > 0 ? 1 : 0);
