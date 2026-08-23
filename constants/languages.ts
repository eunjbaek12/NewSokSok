// zh 의 🇨🇳 는 의도된 것이다. App Store 에 번체(zh-Hant) 로케일을 올리기로 하면서
// 한 번 중립 글리프 「中」 로 바꿨다가 되돌렸다(2026-08-23). 같은 검토를 반복하지 않도록
// 근거를 남긴다.
//
// 🔑 지금 이 앱의 중국어는 끝까지 간체·본토다 — 그래서 🇨🇳 가 정확한 라벨이다:
//   · 도착어 zh 공식 덱 1개(기초 한국어 500)의 뜻·예문 500개가 간체
//   · 출발어 zh 공식 덱 4개가 HSK 1·3·5급 + 본토 슬랭
//   · TTS 가 zh-CN (아래 TTS_LANG) · 입력 플레이스홀더가 `输入单词` (i18n 3 로케일)
// 국기만 중립으로 바꾸면 "간체다"라고 말해 주던 신호가 사라져, 번체를 기대하고 연
// 사용자가 간체를 만난다. 라벨이 아니라 콘텐츠가 문제이므로 라벨만 손대지 않는다.
//
// 🔴 🇹🇼 로 바꾸는 것도 답이 아니다 — 출발어 덱 4개가 HSK·본토라 그쪽이 대신 어긋난다(4:1).
// 제대로 가르려면 zh-Hans 🇨🇳 / zh-Hant 🇹🇼 로 코드를 쪼개야 하고, 그건 TTS 맵·서버 덱의
// language 값·기존 사용자 단어 마이그레이션까지 번진다.
// ⏭️ 바꿀 시점은 **번체 콘텐츠가 생길 때**다. 그때 분리와 국기를 함께 한다.
export const SUPPORTED_LANGUAGES = [
  { code: 'en', flag: '🇺🇸' },
  { code: 'ko', flag: '🇰🇷' },
  { code: 'ja', flag: '🇯🇵' },
  { code: 'zh', flag: '🇨🇳' },
  { code: 'vi', flag: '🇻🇳' },
  { code: 'es', flag: '🇪🇸' },
] as const;

export type LanguageCode = typeof SUPPORTED_LANGUAGES[number]['code'];

export function getLanguageFlag(code: string): string {
  return SUPPORTED_LANGUAGES.find(l => l.code === code)?.flag ?? '🌐';
}

/** App language code → BCP-47 tag for TTS (expo-speech). */
const TTS_LANG: Record<string, string> = {
  en: 'en-US',
  ko: 'ko-KR',
  ja: 'ja-JP',
  zh: 'zh-CN',
  vi: 'vi-VN',
  es: 'es-ES',
};

/**
 * Returns a BCP-47 language tag for TTS. Falls back to en-US.
 * Passing the wrong tag (e.g. en-US for Japanese text) makes the device
 * TTS engine produce no audio, so every speak() call must pass the term's
 * actual source language.
 */
export function getTtsLang(code?: string): string {
  return TTS_LANG[code ?? ''] ?? 'en-US';
}

/**
 * 학습 화면(플래시카드·퀴즈·예문·오토플레이)·단어장 상세 TTS용 소스 언어 결정.
 *
 * 단어 자체 언어를 우선한다: 한 단어장에 여러 언어쌍이 섞일 수 있어(저장한
 * 덱에 다른 언어 단어 추가, AI 생성 언어 변경 등) 리스트 언어를 우선하면
 * 소수 언어 단어가 엉뚱한 보이스로 호출돼 무음·오독이 된다. 리스트 언어는
 * 단어에 언어가 없을 때(sourceLang 컬럼 이전 구버전 단어)의 폴백.
 * 구버전 createCuratedList가 단어를 en/ko로 오스탬프한 덱은 단어 우선 시
 * 역행하지만, 표시도 이미 깨져 보이는 덱이며 재저장으로 복구된다.
 */
export function getStudySourceLang(
  word: { sourceLang?: string },
  list?: { sourceLanguage?: string },
): string | undefined {
  return word.sourceLang ?? list?.sourceLanguage;
}

/**
 * Picks the best string to feed to TTS for a given word.
 *
 * 일본어 단독 한자 단어(예: "層", "対象層")는 안드로이드/iOS 일본어 TTS가
 * 음독·훈독을 결정하지 못해 무음으로 빠지는 경우가 잦다. AI 생성·큐레이션
 * 모두 phonetic 필드에 후리가나(가나 표기)를 채우므로, 일본어이면 phonetic을
 * 우선 사용해 무음 케이스를 회피한다.
 *
 * 중국어는 반대로 한자(term) 자체가 TTS 친화적이고 phonetic은 병음(라틴
 * 알파벳)이라 그대로 두면 영어 보이스로 잘못 읽히므로 term을 유지한다.
 */
export function getSpeakableText(
  term: string,
  phonetic: string | undefined,
  sourceLang: string | undefined,
): string {
  if (sourceLang === 'ja' && phonetic && phonetic.trim()) return phonetic;
  return term;
}

/** Returns localized language name using i18n. Falls back to uppercase code. */
export function getLanguageLabel(code: string, t: (key: string) => string): string {
  return t(`languages.${code}`) || code.toUpperCase();
}

/** App language code → English name, for AI prompts. */
const AI_LANG_NAME: Record<string, string> = {
  en: 'English', ko: 'Korean', ja: 'Japanese', zh: 'Chinese', vi: 'Vietnamese', es: 'Spanish',
};

/**
 * 프롬프트에 쓰는 영어 언어명. UI 라벨(getLanguageLabel)과 달리 번역하지 않는다 —
 * 모델에게 주는 지시라 사용자 UI 언어와 무관하게 고정돼야 한다.
 *
 * 프롬프트가 응답 필드를 레거시 이름(meaningKr/exampleKr/exampleEn)으로 부르는 탓에
 * 모델이 그 이름을 언어 지시로 읽는 실측 사례가 있다. 그걸 반박하는 문장이 이 이름을
 * 쓰므로, 한국어 라벨('영어')이 아니라 영어명이어야 자동완성 프롬프트와 문구가 같아진다.
 */
export function getAiLanguageName(code: string): string {
  return AI_LANG_NAME[code] || code;
}

/**
 * 단어장 상세·편집 화면 표시용 대표 언어쌍.
 *
 * 언어는 "단어마다" 귀속되므로(단어장 생성 시 언어를 강제하지 않음) 단어들의
 * 최빈 sourceLang/targetLang을 진실로 삼는다. 단어가 하나도 없는 빈 단어장만
 * list 메타데이터로, 그것도 없으면 en→ko로 폴백한다. 동률이면 먼저 등장한
 * 언어를 택한다(Map 삽입 순서 = 안정적).
 */
export function deriveDisplayLanguages(
  words: { sourceLang?: string; targetLang?: string }[],
  list?: { sourceLanguage?: string; targetLanguage?: string },
): { source: string; target: string } {
  const mode = (
    pick: (w: { sourceLang?: string; targetLang?: string }) => string | undefined,
  ): string | undefined => {
    const counts = new Map<string, number>();
    for (const w of words) {
      const v = pick(w);
      if (!v) continue;
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    let best: string | undefined;
    let bestN = 0;
    for (const [code, n] of counts) {
      if (n > bestN) { best = code; bestN = n; }
    }
    return best;
  };

  return {
    source: mode(w => w.sourceLang) ?? list?.sourceLanguage ?? 'en',
    target: mode(w => w.targetLang) ?? list?.targetLanguage ?? 'ko',
  };
}

/**
 * 단어들의 언어쌍이 섞여 있는지(출발어 또는 도착어가 2종 이상).
 *
 * 카드의 대표 언어쌍은 최빈 언어라 혼합 덱에서는 소수 언어 단어의 존재를
 * 가려 오해를 부른다 — 이 경우 언어쌍 표시를 숨기는 판정용. 언어가 없는
 * 구버전 단어는 다양성의 증거가 아니므로 무시한다.
 */
export function hasMixedLanguagePairs(
  words: { sourceLang?: string; targetLang?: string }[],
): boolean {
  const sources = new Set<string>();
  const targets = new Set<string>();
  for (const w of words) {
    if (w.sourceLang) sources.add(w.sourceLang);
    if (w.targetLang) targets.add(w.targetLang);
    if (sources.size > 1 || targets.size > 1) return true;
  }
  return false;
}

/**
 * 예문 번역 표시 여부. 같은 언어쌍은 예문 번역이 논리적으로 예문과 같은 문장이라
 * 무의미하고, 실제로 AI가 예문을 그대로 복사(중복)하거나 영어로 이탈해 저장된
 * 데이터가 존재한다(v5 이전 캐시). 빈 값이거나 예문과 동일 문장이면 숨긴다 —
 * 기존 저장 단어의 중복도 마이그레이션 없이 표시 단계에서 정리된다.
 */
export function shouldShowExampleTranslation(exampleEn?: string, exampleKr?: string): boolean {
  const kr = (exampleKr ?? '').trim();
  if (!kr) return false;
  return kr !== (exampleEn ?? '').trim();
}

/** Returns the input placeholder text for the given source language. */
export function getPlaceholderText(sourceLang: LanguageCode, t: (key: string) => string): string {
  return t(`languages.placeholder.${sourceLang}`) || 'Enter a word';
}

/** Returns localized label for the word (term) input field. */
export function getWordLabel(sourceLang: LanguageCode, t: (key: string, opts?: any) => string): string {
  const lang = getLanguageLabel(sourceLang, t);
  return t('languages.wordLabel', { lang });
}

/** Returns localized label for the meaning field. */
export function getMeaningLabel(targetLang: LanguageCode, t: (key: string, opts?: any) => string): string {
  const lang = getLanguageLabel(targetLang, t);
  return t('languages.meaningLabel', { lang });
}

/** Returns localized label for the definition field. */
export function getDefinitionLabel(sourceLang: LanguageCode, t: (key: string, opts?: any) => string): string {
  const lang = getLanguageLabel(sourceLang, t);
  return t('languages.definitionLabel', { lang });
}

/** Returns localized label for the (source-language) example sentence field. */
export function getExampleLabel(sourceLang: LanguageCode, t: (key: string, opts?: any) => string): string {
  const lang = getLanguageLabel(sourceLang, t);
  return t('languages.exampleLabel', { lang });
}

/** Returns localized label for the example translation field. */
export function getExampleTranslationLabel(targetLang: LanguageCode, t: (key: string, opts?: any) => string): string {
  const lang = getLanguageLabel(targetLang, t);
  return t('languages.translationLabel', { lang });
}

/** 한국어와 짝을 이루는 사전(한국 로케일). 각 사전은 양방향 검색을 처리한다. */
const NAVER_KO_PAIR_DICT: Record<string, string> = {
  en: 'https://en.dict.naver.com',
  ja: 'https://ja.dict.naver.com',
  zh: 'https://zh.dict.naver.com',
  vi: 'https://dict.naver.com/vikodict',
  es: 'https://dict.naver.com/eskodict',
};

/**
 * 영어와 짝을 이루는 글로벌 사전(UI 영어).
 * ⚠️ dict.naver.com/enjadict 류 경로는 한국 로케일에서 영한사전으로 강제
 * 리다이렉트되므로 반드시 english.dict.naver.com 경로를 써야 한다(2026-07 실측).
 */
const NAVER_EN_PAIR_DICT: Record<string, string> = {
  ja: 'https://english.dict.naver.com/english-japanese-dictionary',
  zh: 'https://english.dict.naver.com/english-chinese-dictionary',
  vi: 'https://english.dict.naver.com/english-vietnamese-dictionary',
  es: 'https://english.dict.naver.com/english-spanish-dictionary',
};

/**
 * 네이버 사전 검색 URL. 언어쌍당 사전 1개가 양방향 검색을 처리하므로
 * (예: vikodict는 "ăn"도 "먹다"도 찾는다) 방향 구분은 필요 없다.
 *
 * 우선순위:
 *   1. 한국어가 낀 쌍(ko→ko 포함) → 한국 로케일 사전
 *   2. 영어가 낀 쌍(en→en 포함) → 글로벌 사전
 *   3. 그 외(ja↔zh, es↔vi 등) → en↔출발어 글로벌 사전 폴백.
 *      출발어 단어를 확실히 찾을 수 있고 뜻이 영어로 나온다.
 */
export function getNaverDictUrl(
  sourceLang: string | undefined,
  targetLang: string | undefined,
  term: string,
): string {
  const src = sourceLang || 'en';
  const tgt = targetLang || 'ko';
  let base: string;
  if (src === 'ko') {
    base = tgt === 'ko' ? 'https://ko.dict.naver.com' : NAVER_KO_PAIR_DICT[tgt] ?? 'https://ko.dict.naver.com';
  } else if (tgt === 'ko') {
    base = NAVER_KO_PAIR_DICT[src] ?? 'https://en.dict.naver.com';
  } else if (src === 'en') {
    base = tgt === 'en' ? 'https://english.dict.naver.com/english-dictionary' : NAVER_EN_PAIR_DICT[tgt] ?? 'https://en.dict.naver.com';
  } else {
    // tgt === 'en'인 쌍과 비영어·비한국어 상호쌍 모두 en↔출발어 사전이 최선.
    base = NAVER_EN_PAIR_DICT[src] ?? 'https://en.dict.naver.com';
  }
  return `${base}/#/search?query=${encodeURIComponent(term.trim())}`;
}
