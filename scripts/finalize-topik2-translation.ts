/** 생성 완료 뒤, 기계 검증 가능한 로마자와 확인된 예문 오류를 수정해 최종 결과를 쓴다. */
import fs from 'fs';
import path from 'path';
import { checkRomaja } from './lib/romanize';
import { collectFindings, reportFindings } from './lib/ko-deck-checks';

const progress = path.resolve('scripts/.topik2-translate-progress.json');
const output = path.resolve('scripts/topik2-translated.json');
const items = JSON.parse(fs.readFileSync(progress, 'utf8')) as Array<{ term: string; romaja: string; exampleKo: string; exampleEn: string }>;

for (const item of items) {
  const result = checkRomaja(item.term, item.romaja);
  if (result && !result.ok) item.romaja = result.expected[0];
}

const specialty = items.find(item => item.term === '전문');
if (!specialty) throw new Error('전문 카드를 찾지 못했습니다.');
specialty.exampleKo = '저는 인공지능을 전문 분야로 연구하고 있어요.';
specialty.exampleEn = 'I am studying artificial intelligence as my field of expertise.';

const findings = collectFindings(items, { meaningMax: 70, exampleMax: 55 });
if (!reportFindings(findings, items.length)) throw new Error('자동 품질 검사 실패');
fs.writeFileSync(output, JSON.stringify(items, null, 2));
fs.unlinkSync(progress);
console.log(`complete: ${output}`);
