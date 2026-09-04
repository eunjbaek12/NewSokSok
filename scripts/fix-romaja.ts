/**
 * 로마자 교정 — 생성기가 낸 romaja 중 검사기가 틀렸다고 한 것만 다시 계산해 덮어쓴다.
 *
 * 왜 필요한가: translate-situation-vocab.ts 는 생성 직후 checkRomaja 로 검사해 **알려만**
 * 준다. 그래서 82bfcc6(5덱 250장) 때는 15건을 손으로 고쳤다. 생성마다 4~8% 가 틀리는데
 * (실측: 250장 15건, ceremony 50장 8건, sightseeing 50장 2건) 손으로 옮기다 보면
 * 오타가 섞이고, 무엇보다 **검사기가 이미 정답을 알고 있다** — romanizeCandidates 의
 * 첫 후보가 그것이다.
 *
 * 🔑 검사기와 같은 함수를 쓴다. 표를 복제하면 검사는 통과하는데 값은 틀린 상태가 된다.
 * 🔴 checkRomaja 가 null 을 주는 항목(판정 불가)은 건드리지 않는다.
 *
 * 실행: npx -y tsx scripts/fix-romaja.ts <deck> [deck...]
 *   예) npx -y tsx scripts/fix-romaja.ts ceremony sightseeing
 */
import fs from 'node:fs';
import { checkRomaja, romanizeCandidates } from './lib/romanize';

const decks = process.argv.slice(2);
if (decks.length === 0) {
  console.error('❌ 사용법: npx -y tsx scripts/fix-romaja.ts <deck> [deck...]');
  process.exit(1);
}

for (const deck of decks) {
  const path = `scripts/${deck}-translated.json`;
  const rows = JSON.parse(fs.readFileSync(path, 'utf8'));
  let fixed = 0;
  for (const row of rows) {
    const verdict = checkRomaja(row.term, row.romaja);
    if (verdict && !verdict.ok) {
      const before = row.romaja;
      row.romaja = romanizeCandidates(row.term)[0];
      console.log(`  ${row.term}: ${before} → ${row.romaja}`);
      fixed++;
    }
  }
  fs.writeFileSync(path, JSON.stringify(rows, null, 2) + '\n');

  // 되읽어 재검사 — 쓴 값이 실제로 통과하는지 본다.
  const left = JSON.parse(fs.readFileSync(path, 'utf8')).filter((r: { term: string; romaja: string }) => {
    const v = checkRomaja(r.term, r.romaja);
    return v && !v.ok;
  });
  console.log(`${deck}: ${fixed}건 교정 · 남은 결함 ${left.length}건`);
  if (left.length > 0) process.exitCode = 1;
}
