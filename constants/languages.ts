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

/** Returns the input placeholder text for the given source language. */
export function getPlaceholderText(sourceLang: LanguageCode, t: (key: string) => string): string {
  return t(`languages.placeholder.${sourceLang}`) || 'Enter a word';
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
