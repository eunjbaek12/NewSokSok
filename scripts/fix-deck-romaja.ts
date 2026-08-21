/**
 * 큐레이션 덱의 로마자(phonetic)를 개정 로마자 변환기 결과로 고친다.
 *
 * 왜 필요한가: AI 는 로마자를 **무작위로** 틀린다. 한국어 사다리 신규 카드 1,686장에서
 * 138건(8.2%)이 틀렸는데, 체계적 오류가 아니라 같은 규칙을 어떤 낱말에서는 맞히고
 * 어떤 낱말에서는 놓치는 식이었다(비음화 `음료` eumryo, 유음화 `분리` bunri, 연음
 * `활용` hwalyong). 로마자는 표준 발음에서 규칙으로 결정되는 값이므로 생성에 맡길
 * 이유가 없다 — 생성 뒤에 규칙으로 고정한다.
 *
 * 🔴 그런데 통째로 덮어쓰면 안 된다. 변환기가 틀리고 AI 가 맞은 자리가 실제로 있었다:
 *    - 구개음화 `묻히다` muchida (변환기는 mutida 를 기대했다 — 규칙을 추가해 고쳤다)
 *    - ㄴ 첨가 `알약` allyak (변환기는 aryak — N_INSERTION 에 등록해 고쳤다)
 *    그래서 이 스크립트는 **변환기 후보 어디에도 맞지 않는 값만** 바꾸고, 후보 중
 *    하나와 맞으면 손대지 않는다. 변환기를 고칠 일이 생기면 여기가 아니라
 *    scripts/lib/romanize.ts 를 고치고 회귀 테스트를 남길 것.
 *
 * 실행:
 *   npx ts-node -P tsconfig.scripts.json scripts/fix-deck-romaja.ts --dry-run
 *   npx ts-node -P tsconfig.scripts.json scripts/fix-deck-romaja.ts
 * 옵션: --deck=<id 일부>  덱 하나만
 */
import fs from 'fs';
import path from 'path';
import { checkRomaja } from './lib/romanize';

const DRY = process.argv.includes('--dry-run');
const deckArg = process.argv.find(a => a.startsWith('--deck='));
const DECK_FILTER = deckArg ? deckArg.split('=')[1] : '';

const CURATION_PATH = path.resolve(process.cwd(), 'constants/curationData.ts');
const src = fs.readFileSync(CURATION_PATH, 'utf8');
const decks: any[] = JSON.parse(src.slice(src.indexOf('= [') + 2, src.lastIndexOf(']') + 1));

interface Fix { deck: string; term: string; before: string; after: string; kind: string }
const fixes: Fix[] = [];
let scanned = 0, empty = 0;

for (const d of decks) {
  // 로마자는 표제어가 한국어일 때만 뜻이 있다(도착어가 무엇이든 같은 값이다).
  if (d.sourceLanguage !== 'ko') continue;
  if (DECK_FILTER && !d.id.includes(DECK_FILTER)) continue;
  for (const w of d.words) {
    scanned++;
    const got = String(w.phonetic ?? '');
    // 🔴 빈칸은 채우지 않는다. '틀린 값'이 아니라 '없는 값'이고, 변환기는 여러 어절을
    //    이어 붙여 공백을 잃는다(폼 미쳤다 → pommichyeotda). 채우려면 그 결함부터 고칠 것.
    //    실측: 한국어 출발 덱에 빈칸 134건이 있다(krteen·krslang 등 신조어 덱).
    if (!got.trim()) { empty++; continue; }
    const r = checkRomaja(w.term, got);
    if (!r || r.ok) continue;         // 판정 불가(한글 아님) 또는 이미 맞음 → 손대지 않는다
    // 후보가 여럿일 때 첫 번째는 격음화를 반영한 축약형이다. 용언에서는 그쪽이 맞고
    // (로마자 표기법 제3장 제1항 4호 붙임의 'ㅎ 을 밝혀 적는' 예외는 체언에 한한다),
    // 통합 스크립트의 fixRomajaAspiration 도 같은 방향으로 고정한다.
    const after = r.expected[0];
    const kind = /[가-힣]/.test(got) ? '한글 잔존'
      : /[^a-z' -]/.test(got.toLowerCase()) ? '이질 문자'
      : '표기법';
    fixes.push({ deck: d.id, term: w.term, before: got, after, kind });
    w.phonetic = after;
  }
}

const byKind: Record<string, number> = {};
for (const f of fixes) byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;
console.log(`📂 한국어 출발 카드 ${scanned}장 검사 · 고칠 것 ${fixes.length}건 · 로마자 빈칸 ${empty}건(건드리지 않음)`);
for (const [k, n] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) console.log(`   ${k.padEnd(8)} ${n}건`);
console.log();
for (const f of fixes) console.log(`   ${f.term.padEnd(7)} ${f.before.padEnd(19)} → ${f.after}   [${f.deck.replace('curated-', '')}]`);

if (!fixes.length) { console.log('\n고칠 것이 없습니다.'); process.exit(0); }
if (DRY) { console.log('\n--dry-run: 파일을 쓰지 않았습니다.'); process.exit(0); }

const eol = src.includes('\r\n') ? '\r\n' : '\n';
const body = `import { VocaList } from '@/lib/types';\n\nexport const curationPresets: VocaList[] = ${JSON.stringify(decks, null, 2)};\n`;
fs.writeFileSync(CURATION_PATH, eol === '\n' ? body : body.replace(/\n/g, eol));
console.log(`\n✅ ${CURATION_PATH} — ${fixes.length}건 반영`);
