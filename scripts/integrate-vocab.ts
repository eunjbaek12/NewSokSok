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
  definition?: string;
  phonetic?: string;   // EN: IPA. JP: hiragana reading. ZH: pinyin (from `reading`). VI: empty (정자법 내장)
  reading?: string;    // JP/ZH only
  pos: string;
  meaningKr?: string;
  exampleEn?: string;  // EN: English example. JP/ZH/VI: filled from exampleJa/exampleZh/exampleVi
  exampleJa?: string;  // JP only
  exampleZh?: string;  // ZH only
  exampleVi?: string;  // VI only
  exampleKr?: string;
  // KO (ko→en, 방향 반대): meaning/example이 영어가 target
  meaningEn?: string;  // KO: 영어 뜻 → meaningKr 슬롯
  romaja?: string;     // KO: 로마자 → phonetic 슬롯
  exampleKo?: string;  // KO: 한국어 예문 → exampleEn 슬롯(원어, ko TTS)
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
  'jp-intermediate': {
    id: 'curated-jp-intermediate-1',
    title: '중급 일본어 500 (JLPT N3)',
    icon: '🍣',
    category: '중급',
    level: 'intermediate',
    description: 'JLPT N3 중급 일본어 500. Wiktionary "Appendix:JLPT/N3" (CC BY-SA 4.0) 빈도순 기반, JMdict로 POS 검증, 한국어 뜻·N3 예문 AI 생성',
    tags: ['Japanese', 'JLPT', 'Intermediate'],
    sourceLanguage: 'ja',
    targetLanguage: 'ko',
  },
  'jp-advanced': {
    id: 'curated-jp-advanced-1',
    title: '고급 일본어 500 (JLPT N1)',
    icon: '🍣',
    category: '고급',
    level: 'advanced',
    description: 'JLPT N1 고급 일본어 500. Wiktionary "Appendix:JLPT/N1" (CC BY-SA 4.0) 빈도순 기반, JMdict로 POS 검증, 한국어 뜻·N1 예문 AI 생성',
    tags: ['Japanese', 'JLPT', 'Advanced'],
    sourceLanguage: 'ja',
    targetLanguage: 'ko',
  },
  zh: {
    id: 'curated-zh-basic-1',
    title: '기초 중국어 500 (HSK 1급)',
    icon: '🐼',
    category: '기초',
    level: 'beginner',
    description: 'HSK 1급 기초 중국어 500. Wiktionary HSK v3.0 어휘 목록 (CC BY-SA 4.0) 기반, CC-CEDICT로 병음·정의 검증, 한국어 뜻·예문 AI 생성',
    tags: ['Chinese', 'HSK', 'Foundation'],
    sourceLanguage: 'zh',
    targetLanguage: 'ko',
  },
  'zh-intermediate': {
    id: 'curated-zh-intermediate-1',
    title: '중급 중국어 500 (HSK 3급)',
    icon: '🐼',
    category: '중급',
    level: 'intermediate',
    description: 'HSK 3급 중급 중국어 500. Wiktionary "HSK list of Mandarin words v3.0/level 3" (CC BY-SA 4.0) 기반, CC-CEDICT로 병음·정의 검증, 한국어 뜻·HSK 3 예문 AI 생성',
    tags: ['Chinese', 'HSK', 'Intermediate'],
    sourceLanguage: 'zh',
    targetLanguage: 'ko',
  },
  'zh-advanced': {
    id: 'curated-zh-advanced-1',
    title: '고급 중국어 500 (HSK 5급)',
    icon: '🐼',
    category: '고급',
    level: 'advanced',
    description: 'HSK 5급 고급 중국어 500. Wiktionary "HSK list of Mandarin words v3.0/level 5" (CC BY-SA 4.0) 기반, CC-CEDICT로 병음·정의 검증, 한국어 뜻·HSK 5 예문 AI 생성',
    tags: ['Chinese', 'HSK', 'Advanced'],
    sourceLanguage: 'zh',
    targetLanguage: 'ko',
  },
  ko: {
    id: 'curated-ko-basic-1',
    title: 'Basic Korean 500 (for English speakers)',
    icon: '🇰🇷',
    category: '기초',
    level: 'beginner',
    description: 'Basic Korean 500 for English speakers. Based on the NIKL frequency list via Wiktionary "Basic Korean Vocabulary List" (CC BY-SA 4.0); English meanings & examples AI-generated.',
    tags: ['Korean', 'TOPIK', 'Foundation'],
    sourceLanguage: 'ko',
    targetLanguage: 'en',
  },
  'ko-intermediate': {
    id: 'curated-ko-intermediate-1',
    title: 'Intermediate Korean 500 (for English speakers)',
    icon: '🇰🇷',
    category: '중급',
    level: 'intermediate',
    description: 'Intermediate Korean 500 for English speakers (TOPIK II 3-4). NIKL grade B from Wiktionary "Basic Korean Vocabulary List" (CC BY-SA 4.0); English meanings & TOPIK 3-4 examples AI-generated.',
    tags: ['Korean', 'TOPIK', 'Intermediate'],
    sourceLanguage: 'ko',
    targetLanguage: 'en',
  },
  'ko-advanced': {
    id: 'curated-ko-advanced-1',
    title: 'Advanced Korean 500 (for English speakers)',
    icon: '🇰🇷',
    category: '고급',
    level: 'advanced',
    description: 'Advanced Korean 500 for English speakers (TOPIK II 5-6). NIKL grade C from Wiktionary "Basic Korean Vocabulary List" (CC BY-SA 4.0); English meanings & TOPIK 5-6 examples AI-generated.',
    tags: ['Korean', 'TOPIK', 'Advanced'],
    sourceLanguage: 'ko',
    targetLanguage: 'en',
  },
  vi: {
    id: 'curated-vi-basic-1',
    title: '기초 베트남어 500',
    icon: '🇻🇳',
    category: '기초',
    level: 'beginner',
    description: '일상 베트남어 기초 500. OpenSubtitles 빈도 리스트 (FrequencyWords, CC BY-SA 4.0) 기반, 품사·정의·한국어 뜻·예문 AI 생성',
    tags: ['Vietnamese', 'Daily', 'Foundation'],
    sourceLanguage: 'vi',
    targetLanguage: 'ko',
  },
  spelling: {
    id: 'curated-spelling-ko-1',
    title: '자주 틀리는 한국어 맞춤법 100',
    icon: '✍️',
    category: '한국어',
    level: 'intermediate',
    description: '한국인이 일상에서 가장 자주 틀리는 맞춤법 100쌍. 어미·활용·외래어 표기·사이시옷·관용 표현까지. 국립국어원 어문규범 (KOGL 1유형) 참조, 정의·구분법·예문 AI 생성',
    tags: ['Korean', 'Spelling', '맞춤법'],
    sourceLanguage: 'ko',
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

  // 언어별 스키마를 앱 공통 슬롯(meaningKr/phonetic/exampleEn/exampleKr)으로 정규화.
  // KO→EN 계열(외국인용 한국어 학습)은 방향이 반대라 슬롯 의미를 매핑: 뜻 슬롯=영어, 원어 예문 슬롯=한국어.
  // KO→KO(맞춤법 등 한국인용)는 translate 단계에서 이미 공통 슬롯에 채워 보내므로 일반 분기 사용.
  const normalized = (meta.sourceLanguage === 'ko' && meta.targetLanguage === 'en')
    ? items.map(w => ({
        ...w,
        definition: w.meaningEn ?? '',     // 영어 정의
        meaningKr: w.meaningEn ?? '',       // 뜻 슬롯(카드 뒷면) = 영어
        phonetic: w.romaja ?? '',           // 발음 = 로마자
        exampleEn: w.exampleKo ?? '',       // 원어 예문 슬롯 = 한국어 (sourceLanguage=ko로 TTS)
        exampleKr: w.exampleEn ?? '',       // 번역 슬롯 = 영어
      }))
    : items.map(w => ({
        ...w,
        phonetic: w.phonetic ?? w.reading ?? '',
        exampleEn: w.exampleEn ?? w.exampleJa ?? w.exampleZh ?? w.exampleVi ?? '',
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
