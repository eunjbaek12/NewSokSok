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

/** Returns localized label for the example translation field. */
export function getExampleTranslationLabel(targetLang: LanguageCode, t: (key: string, opts?: any) => string): string {
  const lang = getLanguageLabel(targetLang, t);
  return t('languages.translationLabel', { lang });
}

export function getNaverDictCode(sourceLang: string, targetLang: string): string | null {
  const map: Record<string, string> = {
    'en-ko': 'enko',
    'ja-ko': 'jako',
    'zh-ko': 'zhko',
    'ko-en': 'koen',
    'ko-ja': 'koja',
    'ko-zh': 'kozh',
  };
  return map[`${sourceLang}-${targetLang}`] || null;
}

export function getNaverDictSubdomain(dictCode: string): string {
  if (dictCode.startsWith('en') || dictCode === 'koen') return 'en';
  if (dictCode.startsWith('ja') || dictCode === 'koja') return 'ja';
  if (dictCode.startsWith('zh') || dictCode === 'kozh') return 'zh';
  if (dictCode.startsWith('ko')) return 'korean';
  return 'en';
}
