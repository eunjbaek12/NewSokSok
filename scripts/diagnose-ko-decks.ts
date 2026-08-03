/**
 * constants/curationData.ts 에서 한국어가 얽힌 덱을 공용 규칙으로 훑는다.
 *
 * 새 덱을 만들 때는 translate 스크립트가 생성 직후에 같은 검사를 돌리지만, 이 도구는
 * 이미 통합·커밋된 덱까지 다시 본다. 규칙을 새로 추가했을 때(특히 로마자 자동 검증)
 * 예전 덱에 남아 있는 오류를 찾아내는 용도다.
 *
 * 범위가 두 번 넓어졌다 — 두 번 다 "검사가 통과했다"가 "문제가 없다"를 뜻하지 않았다:
 *  1. ko→en 만 보던 때, 같은 덱의 vi/ja/zh 판이 로마자를 따로 생성해 두는 바람에
 *     46건이 검사 밖에 숨어 있었다 → 한국어가 출발어이기만 하면 전부 대상으로.
 *  2. 그래도 한국어가 **도착어**인 덱(en→ko, zh→ko …)은 한 번도 안 봤다. '당신'이
 *     100건 있었다 → 이제 그쪽도 대상. 다만 거기의 한국어는 학습 대상이 아니라
 *     원어 예문의 번역문이라 규칙의 무게가 다르다(ko-deck-checks 의 koreanIsTranslation).
 *
 * 실행: npx ts-node -P tsconfig.scripts.json scripts/diagnose-ko-decks.ts
 * 옵션: --deck=<id 일부>  특정 덱만
 *       --dir=source|target  한국어가 출발어인 덱만 / 도착어인 덱만
 */
import fs from 'fs';
import path from 'path';
import { collectFindings, reportFindings, DeckEntry } from './lib/ko-deck-checks';

const deckArg = process.argv.find(a => a.startsWith('--deck='));
const DECK_FILTER = deckArg ? deckArg.split('=')[1] : '';
const dirArg = process.argv.find(a => a.startsWith('--dir='));
const DIR_FILTER = dirArg ? dirArg.split('=')[1] : '';

const CURATION_PATH = path.resolve(process.cwd(), 'constants/curationData.ts');
const src = fs.readFileSync(CURATION_PATH, 'utf8');
// `export const curationPresets: VocaList[] = [...]` 에서 배열만 떼어 파싱한다.
// indexOf('[')를 쓰면 VocaList[] 의 대괄호를 잡으므로 '= [' 를 찾아야 한다.
const decks: any[] = JSON.parse(src.slice(src.indexOf('= [') + 2, src.lastIndexOf(']') + 1));

const koIsSource = (d: any) => d.sourceLanguage === 'ko';
const koIsTarget = (d: any) => d.sourceLanguage !== 'ko' && d.targetLanguage === 'ko';

const targets = decks.filter(d =>
  (koIsSource(d) || koIsTarget(d))
  && (!DECK_FILTER || d.id.includes(DECK_FILTER))
  && (!DIR_FILTER || (DIR_FILTER === 'source' ? koIsSource(d) : koIsTarget(d))));

if (!targets.length) {
  console.error(`❌ 대상 덱이 없습니다${DECK_FILTER ? ` (--deck=${DECK_FILTER})` : ''}`);
  process.exit(1);
}

const srcCount = targets.filter(koIsSource).length;
console.log(`📚 덱 ${targets.length}개 검사 (한국어 출발 ${srcCount} · 한국어 도착 ${targets.length - srcCount})\n`);
let totalHard = 0;
let totalWords = 0;

for (const d of targets) {
  const asSource = koIsSource(d);
  // 앱 슬롯 → 검사용 형태. exampleEn 슬롯은 언제나 '원어 예문', exampleKr 은 '도착어
  // 번역'이므로, 한국어 문장이 어느 쪽에 있는지가 방향에 따라 뒤집힌다.
  const entries: DeckEntry[] = d.words.map((w: any) => ({
    term: w.term,
    romaja: asSource ? w.phonetic : undefined,
    meaningEn: w.meaningKr,
    exampleKo: asSource ? w.exampleEn : w.exampleKr,
    exampleEn: asSource ? w.exampleKr : w.exampleEn,
  }));
  // ko→ko(맞춤법·유행어 풀이)는 한국어 사용자용이라 로마자 슬롯이 비어 있는 게 정상이고,
  // 번역 슬롯에도 한글이 들어간다. 한국어 도착 덱은 표제어가 한글이 아니라 로마자가 없다.
  const koToKo = asSource && d.targetLanguage === 'ko';
  const findings = collectFindings(entries, {
    allowHangulInTranslation: koToKo,
    skipRomaja: koToKo || !asSource,
    koreanIsTranslation: !asSource,
  });
  const hard = findings.filter(f => !f.advisory);
  totalWords += entries.length;
  totalHard += hard.length;

  const label = `${d.title} [${d.sourceLanguage}→${d.targetLanguage}] (${entries.length}단어)`;
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
