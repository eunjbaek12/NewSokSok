/**
 * 번역된 어휘 목록을 constants/curationData.ts 에 추가합니다.
 *
 * 실행: npx ts-node scripts/integrate-vocab.ts <list-name>
 *   예) npx ts-node scripts/integrate-vocab.ts nawl
 */

import fs from 'fs';
import path from 'path';

const LIST_NAME = process.argv[2]?.toLowerCase();
if (!LIST_NAME) {
  console.error('❌ 사용법: npx ts-node scripts/integrate-vocab.ts <list-name>');
  process.exit(1);
}

interface TranslatedEntry {
  rank: number;
  term: string;
  definition: string;
  phonetic?: string;   // EN: IPA. JP: hiragana reading (from `reading`)
  reading?: string;    // JP only
  pos: string;
  meaningKr: string;
  exampleEn?: string;  // EN: English example. JP: Japanese example (filled from `exampleJa`)
  exampleJa?: string;  // JP only
  exampleKr: string;
}

interface ListMeta {
  id: string;
  title: string;
  icon: string;
  category: string;
  level: string;
  description: string;
  tags: string[];
  sourceLanguage?: string;  // default 'en'
  targetLanguage?: string;  // default 'ko'
}

const META: Record<string, ListMeta> = {
  nawl: {
    id: 'curated-nawl-1',
    title: '수능·학문 핵심 957',
    icon: '🎓',
    category: '시험',
    level: 'advanced',
    description: '수능·TOEFL·IELTS 학술 어휘 957. NAWL by Browne & Culligan (CC BY-SA 4.0) 기반, 뜻·예문 AI 생성',
    tags: ['수능', 'TOEFL', 'IELTS', 'Academic'],
  },
  bsl: {
    id: 'curated-bsl-1',
    title: '비즈니스 영어 핵심 1000',
    icon: '📊',
    category: '비즈니스',
    level: 'intermediate',
    description: '실무 비즈니스 영어 1000. BSL by Browne & Culligan (CC BY-SA 4.0) 기반, 뜻·예문 AI 생성',
    tags: ['Business', 'TOEIC', 'Workplace'],
  },
  ngsl: {
    id: 'curated-ngsl-1',
    title: '기초 영어 필수 1000',
    icon: '🌱',
    category: '기초',
    level: 'beginner',
    description: '일상 영어 필수 1000. NGSL by Browne & Culligan (CC BY-SA 4.0) 기반, 뜻·예문 AI 생성',
    tags: ['General', 'Daily', 'Foundation'],
  },
  jp: {
    id: 'curated-jp-basic-1',
    title: '기초 일본어 500',
    icon: '🍣',
    category: '기초',
    level: 'beginner',
    description: '일상 일본어 기초 500. Wiktionary "1000 Japanese basic words" (CC BY-SA 4.0) 기반, JMdict로 POS·읽기 검증, 한국어 뜻·예문 AI 생성',
    tags: ['Japanese', 'Daily', 'Foundation'],
    sourceLanguage: 'ja',
    targetLanguage: 'ko',
  },
};

const meta = META[LIST_NAME];
if (!meta) {
  console.error(`❌ 알 수 없는 목록: ${LIST_NAME}. 가능한 값: ${Object.keys(META).join(', ')}`);
  process.exit(1);
}

const TRANSLATED_PATH = path.resolve(process.cwd(), `scripts/${LIST_NAME}-translated.json`);
const CURATION_PATH = path.resolve(process.cwd(), 'constants/curationData.ts');
const NOW = Date.now();

function main() {
  if (!fs.existsSync(TRANSLATED_PATH)) {
    console.error(`❌ 번역 결과 파일 없음: ${TRANSLATED_PATH}`);
    console.error(`먼저 npx ts-node scripts/translate-vocab.ts ${LIST_NAME} 실행하세요.`);
    process.exit(1);
  }

  const items: TranslatedEntry[] = JSON.parse(fs.readFileSync(TRANSLATED_PATH, 'utf8'));
  console.log(`📚 번역된 ${items.length}개 단어 로드`);

  // JP 스키마(`reading`/`exampleJa`)를 공통 필드(`phonetic`/`exampleEn`)로 정규화
  const normalized = items.map(w => ({
    ...w,
    phonetic: w.phonetic ?? w.reading ?? '',
    exampleEn: w.exampleEn ?? w.exampleJa ?? '',
  }));

  const missing = normalized.filter(w => !w.meaningKr || !w.exampleEn);
  if (missing.length > 0) {
    console.error(`❌ ${missing.length}개 단어에 meaningKr/exampleEn 누락`);
    console.error('샘플:', missing.slice(0, 5).map(m => m.term));
    process.exit(1);
  }

  const newList = {
    id: meta.id,
    title: meta.title,
    icon: meta.icon,
    isCurated: true,
    category: meta.category,
    level: meta.level,
    description: meta.description,
    sourceLanguage: meta.sourceLanguage ?? 'en',
    targetLanguage: meta.targetLanguage ?? 'ko',
    isVisible: true,
    createdAt: NOW,
    words: normalized.map((w, idx) => ({
      id: `word-${LIST_NAME}-${idx}-${NOW}`,
      term: w.term,
      definition: w.definition,
      meaningKr: w.meaningKr,
      exampleEn: w.exampleEn!,
      exampleKr: w.exampleKr,
      isMemorized: false,
      isStarred: false,
      tags: meta.tags,
      phonetic: w.phonetic,
      pos: w.pos,
    })),
  };

  const original = fs.readFileSync(CURATION_PATH, 'utf8');

  if (original.includes(`"${meta.id}"`)) {
    console.error(`❌ 이미 ${meta.id} 가 curationData.ts 에 존재합니다.`);
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
    .split('\n').map(line => '  ' + line).join('\n');

  fs.writeFileSync(CURATION_PATH, `${before}\n${inserted},\n${after.trimStart()}`, 'utf8');
  console.log(`✅ "${meta.title}" 추가됨 (${items.length}개 단어, id: ${meta.id})`);
}

main();
