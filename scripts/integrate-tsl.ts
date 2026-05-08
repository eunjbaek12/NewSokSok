/**
 * scripts/tsl-top600-translated.json 을 읽어
 * constants/curationData.ts 의 curationPresets 배열 맨 앞에 TSL 큐레이션을 추가합니다.
 *
 * 실행: npx tsx scripts/integrate-tsl.ts
 *   (먼저 translate-tsl.ts 가 완료되어 있어야 함)
 */

import fs from 'fs';
import path from 'path';

interface TranslatedEntry {
  rank: number;
  term: string;
  definition: string;
  phonetic: string;
  pos: string;
  meaningKr: string;
  exampleEn: string;
  exampleKr: string;
}

const TRANSLATED_PATH = path.resolve(process.cwd(), 'scripts/tsl-top600-translated.json');
const CURATION_PATH = path.resolve(process.cwd(), 'constants/curationData.ts');

const LIST_ID = 'curated-toeic-tsl-1';
const NOW = Date.now();

function buildVocaList(items: TranslatedEntry[]) {
  return {
    id: LIST_ID,
    title: '토익 핵심 600',
    icon: '💼',
    isCurated: true,
    category: '시험',
    level: 'intermediate',
    description: '토익 핵심 어휘 600. TSL by Browne & Culligan (CC BY-SA 4.0) 기반',
    sourceLanguage: 'en',
    targetLanguage: 'ko',
    isVisible: true,
    createdAt: NOW,
    words: items.map((w, idx) => ({
      id: `word-toeic-tsl-${idx}-${NOW}`,
      term: w.term,
      definition: w.definition,
      meaningKr: w.meaningKr,
      exampleEn: w.exampleEn,
      exampleKr: w.exampleKr,
      isMemorized: false,
      isStarred: false,
      tags: ['TOEIC', 'Business'],
      phonetic: w.phonetic,
      pos: w.pos,
    })),
  };
}

function main() {
  if (!fs.existsSync(TRANSLATED_PATH)) {
    console.error(`❌ 번역 결과 파일 없음: ${TRANSLATED_PATH}`);
    console.error('먼저 npx tsx scripts/translate-tsl.ts 실행하세요.');
    process.exit(1);
  }
  const items: TranslatedEntry[] = JSON.parse(fs.readFileSync(TRANSLATED_PATH, 'utf8'));
  console.log(`📚 번역된 ${items.length}개 단어 로드`);

  const missing = items.filter(w => !w.meaningKr || !w.exampleEn);
  if (missing.length > 0) {
    console.error(`❌ ${missing.length}개 단어에 meaningKr/exampleEn 누락`);
    console.error('샘플:', missing.slice(0, 5).map(m => m.term));
    process.exit(1);
  }

  const newList = buildVocaList(items);

  const original = fs.readFileSync(CURATION_PATH, 'utf8');

  if (original.includes(`"${LIST_ID}"`)) {
    console.error(`❌ 이미 ${LIST_ID} 가 curationData.ts 에 존재합니다.`);
    console.error('기존 항목을 먼저 제거하거나 LIST_ID 를 수정하세요.');
    process.exit(1);
  }

  const arrayOpenMatch = original.match(/curationPresets\s*:\s*VocaList\[\]\s*=\s*\[/);
  if (!arrayOpenMatch || arrayOpenMatch.index === undefined) {
    console.error('❌ curationData.ts 배열 시작점을 찾지 못함');
    process.exit(1);
  }
  const arrayOpenEnd = arrayOpenMatch.index + arrayOpenMatch[0].length;

  const before = original.slice(0, arrayOpenEnd);
  const after = original.slice(arrayOpenEnd);

  const inserted = JSON.stringify(newList, null, 2)
    .split('\n')
    .map(line => '  ' + line)
    .join('\n');

  const updated = `${before}\n${inserted},\n${after.trimStart()}`;

  fs.writeFileSync(CURATION_PATH, updated, 'utf8');
  console.log(`✅ ${CURATION_PATH} 에 "${newList.title}" 추가됨 (${items.length}개 단어)`);
  console.log(`   id: ${LIST_ID}`);
}

main();
