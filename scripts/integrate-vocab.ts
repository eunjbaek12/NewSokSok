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
  'ko-zh': {
    id: 'curated-ko-basic-zh-1',
    title: '基础韩语 500（中文使用者）',
    icon: '🇰🇷',
    category: '기초',
    level: 'beginner',
    description: '面向中文使用者的基础韩语 500。基于 NIKL 词频表（Wiktionary "Basic Korean Vocabulary List"，CC BY-SA 4.0）；韩语词条与例句沿用，中文释义与翻译由 AI 生成。',
    tags: ['Korean', 'TOPIK', 'Foundation'],
    sourceLanguage: 'ko',
    targetLanguage: 'zh',
  },
  'ko-ja': {
    id: 'curated-ko-basic-ja-1',
    title: '基礎韓国語 500（日本語話者向け）',
    icon: '🇰🇷',
    category: '기초',
    level: 'beginner',
    description: '日本語話者向けの基礎韓国語 500。NIKL 頻度リスト（Wiktionary「Basic Korean Vocabulary List」CC BY-SA 4.0）に基づく。韓国語の見出し語・例文は共通、日本語の意味と訳は AI 生成。',
    tags: ['Korean', 'TOPIK', 'Foundation'],
    sourceLanguage: 'ko',
    targetLanguage: 'ja',
  },
  'ko-vi': {
    id: 'curated-ko-basic-vi-1',
    title: 'Tiếng Hàn cơ bản 500 (cho người nói tiếng Việt)',
    icon: '🇰🇷',
    category: '기초',
    level: 'beginner',
    description: 'Tiếng Hàn cơ bản 500 dành cho người nói tiếng Việt. Dựa trên danh sách tần suất NIKL (Wiktionary "Basic Korean Vocabulary List", CC BY-SA 4.0); từ vựng & câu ví dụ tiếng Hàn dùng chung, nghĩa & bản dịch tiếng Việt do AI tạo.',
    tags: ['Korean', 'TOPIK', 'Foundation'],
    sourceLanguage: 'ko',
    targetLanguage: 'vi',
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
  'tsl-advanced': {
    id: 'curated-toeic-tsl-2',
    title: '토익 심화 600 (TSL 601-1200)',
    icon: '💼',
    category: '시험',
    level: 'advanced',
    description: '토익 심화 어휘 600 (TSL 빈도 601~1200위). TSL by Browne & Culligan (CC BY-SA 4.0) 기반, 한국어 뜻·예문 AI 생성',
    tags: ['English', 'TOEIC', 'Advanced'],
    sourceLanguage: 'en',
    targetLanguage: 'ko',
  },
  suneung: {
    id: 'curated-suneung-1',
    title: '수능 필수 어휘 500',
    icon: '🎓',
    category: '시험',
    level: 'advanced',
    description: '수능 필수 어휘 500. 교육부 2015 개정 영어과 교육과정 기본어휘목록(교육부 고시 제2015-74호 [별책14], 공공누리 제1유형) 중 고교 권장 심화어 우선 + 중·고 빈출어. 한국어 뜻·예문 AI 생성',
    tags: ['English', '수능', 'CSAT'],
    sourceLanguage: 'en',
    targetLanguage: 'ko',
  },
  saguk: {
    id: 'curated-saguk-ko-1',
    title: 'Sageuk: Korean Historical Drama 100',
    icon: '👑',
    category: '문화',
    level: 'advanced',
    description: 'Words & honorifics from Korean historical dramas (사극, Joseon era) — royal titles, court speech, officials, palace life, punishments & social classes. For fans of K-dramas like Kingdom & Mr. Sunshine. Korean→English; meanings & sageuk-style examples AI-generated.',
    tags: ['Korean', 'Sageuk', 'Culture'],
    sourceLanguage: 'ko',
    targetLanguage: 'en',
  },
  untrans: {
    id: 'curated-untrans-ko-1',
    title: 'Untranslatable Korean 50',
    icon: '💭',
    category: '문화',
    level: 'intermediate',
    description: 'The Korean words English has no single word for — 눈치, 정, 한, 서운하다, 억울하다, 시원하다, 애교, 갑질, 오지랖 and more across relationships, feelings, taste & sensation, character, work life and Korean living. Each card names the closest English word, then draws the line between them — the gap is the lesson. Korean→English; meanings & spoken examples AI-generated.',
    tags: ['Korean', 'Culture', 'Nuance'],
    sourceLanguage: 'ko',
    targetLanguage: 'en',
  },
  mimetic: {
    id: 'curated-mimetic-ko-1',
    title: 'Korean Onomatopoeia & Mimetic Words 100',
    icon: '✨',
    category: '문화',
    level: 'intermediate',
    description: 'The word class English doesn\'t have — 의성어·의태어, the sound and "feel" words that fill K-dramas, webtoons and everyday speech: 반짝반짝, 두근두근, 아삭아삭, 깜짝, 후루룩, 살금살금, 멍멍 and more across light, emotion, laughter, voices, food texture, weather, walking, sleep, pain, impacts, animal sounds & textures. Every card marks whether it copies a sound or a manner and shows the verb it pairs with. Korean→English; meanings & spoken examples AI-generated.',
    tags: ['Korean', 'Mimetic', 'Culture'],
    sourceLanguage: 'ko',
    targetLanguage: 'en',
  },
  kpop: {
    id: 'curated-kpop-ko-1',
    title: 'K-Pop & Idol Stan Slang 100',
    icon: '🎤',
    category: '문화',
    level: 'intermediate',
    description: 'Real K-pop fandom slang every stan should know — 덕질, 최애, 컴백, 직캠, 올킬 and more across fan culture, merch, music activities, member positions & content. Korean→English; meanings & casual fan-style examples AI-generated.',
    tags: ['Korean', 'K-pop', 'Culture'],
    sourceLanguage: 'ko',
    targetLanguage: 'en',
  },
  mzslang: {
    id: 'curated-mzslang-en-1',
    title: '미국 MZ·Z세대 슬랭 100',
    icon: '😎',
    category: '문화',
    level: 'intermediate',
    description: '미국 MZ·Z세대가 실제로 쓰는 SNS·일상 슬랭 100 — slay, no cap, rizz, vibe, GOAT 등 감탄·칭찬·관계·바이브·밈까지. 자극적이지 않은 재미 위주로 엄선. 영어→한국어; 뜻·캐주얼 예문 AI 생성.',
    tags: ['English', 'Slang', 'MZ'],
    sourceLanguage: 'en',
    targetLanguage: 'ko',
  },
  krslang: {
    id: 'curated-krslang-ko-1',
    title: 'Korean Gen-Z & MZ Slang 100',
    icon: '💬',
    category: '문화',
    level: 'intermediate',
    description: 'Real Korean Gen-Z / MZ slang you\'ll see all over Korean social media, K-dramas, and chats — 인싸, 갓생, 썸, 꿀잼, 가즈아 and more across reactions, social types, lifestyle, dating, abbreviations & memes. Korean→English; meanings & casual examples AI-generated.',
    tags: ['Korean', 'Slang', 'MZ'],
    sourceLanguage: 'ko',
    targetLanguage: 'en',
  },
  krteen: {
    id: 'curated-krteen-ko-1',
    title: '요즘 10대 유행어 37 (2026)',
    icon: '🧃',
    category: '문화',
    level: 'beginner',
    description: '2026년 상반기 한국 10대·잘파세대가 실제로 쓰는 유행어 37 — 알잘딱깔쎈, 중꺽마, 이왜진, 럭키비키, 추구미, 얼죽아, 킹받다 등 신상 밈·줄임말·감정 표현까지. 트렌드를 놓친 사람을 위한 한국어 뜻풀이. 자극적이지 않은 깨끗한 것만 엄선, 뜻·유래·예문 AI 생성.',
    tags: ['Korean', 'Slang', 'MZ'],
    sourceLanguage: 'ko',
    targetLanguage: 'ko',
  },
  'es-basic': {
    id: 'curated-es-basic-1',
    title: '기초 스페인어 122 (일상 필수)',
    icon: '🇪🇸',
    category: '기초',
    level: 'beginner',
    description: '일상에서 가장 많이 쓰는 스페인어 기초 단어 122 — 인사·숫자·가족·음식·색깔·요일·기본 동사/형용사·장소·신체까지. 표제어 직접 선별, 한글 발음·한국어 뜻·예문 AI 생성.',
    tags: ['Spanish', 'Daily', 'Foundation'],
    sourceLanguage: 'es',
    targetLanguage: 'ko',
  },
  'krslang-vi': {
    id: 'curated-krslang-vi-1',
    title: 'Tiếng lóng Gen-Z & MZ Hàn Quốc 100',
    icon: '💬',
    category: '문화',
    level: 'intermediate',
    description: 'Tiếng lóng Gen-Z / MZ Hàn Quốc thường gặp khắp mạng xã hội, phim Hàn và tin nhắn — 인싸, 갓생, 썸, 꿀잼, 가즈아 và nhiều từ khác về cảm thán, kiểu người, đời sống, hẹn hò, viết tắt & meme. Tiếng Hàn→Tiếng Việt; nghĩa & ví dụ thân mật do AI tạo.',
    tags: ['Korean', 'Slang', 'MZ'],
    sourceLanguage: 'ko',
    targetLanguage: 'vi',
  },
  zhslang: {
    id: 'curated-zhslang-zh-1',
    title: '중국 MZ·Z세대 슬랭 100',
    icon: '🐲',
    category: '문화',
    level: 'intermediate',
    description: '중국 MZ·Z세대가 웨이보·더우인·게임·채팅에서 실제로 쓰는 인터넷 유행어(网络流行语) 100 — 牛, 绝绝子, yyds, 内卷, 躺平, 社牛, 磕CP 등 감탄·인물·감정·일상·연애·밈/줄임말까지. 자극적이지 않은 재미 위주로 엄선. 중국어→한국어; 병음·뜻·캐주얼 예문 AI 생성.',
    tags: ['Chinese', 'Slang', 'MZ'],
    sourceLanguage: 'zh',
    targetLanguage: 'ko',
  },
  market: {
    id: 'curated-market-ko-1',
    title: 'Korean Market Trip 50',
    icon: '🧺',
    category: '생활',
    level: 'beginner',
    description: 'Everything you need to shop a Korean traditional market — 흥정, 덤, 떨이, 한 근, 거스름돈 and more across stalls & shops, haggling & prices, units, produce quality and paying up. Korean→English; meanings & real market-stall examples AI-generated.',
    tags: ['Korean', 'Market', 'Daily Life'],
    sourceLanguage: 'ko',
    targetLanguage: 'en',
  },
  hiking: {
    id: 'curated-hiking-ko-1',
    title: 'Korean Hiking Trip 50',
    icon: '🥾',
    category: '생활',
    level: 'intermediate',
    description: 'Hike a Korean mountain like a local — 등산로, 능선, 약수터, 아이젠, 하산, 야호 and more across terrain, trails & courses, gear, your body on the climb, and trail etiquette & safety. Korean→English; meanings & on-the-trail examples AI-generated.',
    tags: ['Korean', 'Hiking', 'Daily Life'],
    sourceLanguage: 'ko',
    targetLanguage: 'en',
  },
  clinic: {
    id: 'curated-clinic-ko-1',
    title: 'Korean Clinic Visit 50',
    icon: '🤒',
    category: '생활',
    level: 'beginner',
    description: 'Walk into a Korean clinic with a cold and know what to say — 접수, 몸살, 콧물, 오한, 처방전, 식후 30분 and more across checking in, describing symptoms, the exam, and the pharmacy. Korean→English; meanings & real clinic-visit examples AI-generated.',
    tags: ['Korean', 'Health', 'Daily Life'],
    sourceLanguage: 'ko',
    targetLanguage: 'en',
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
