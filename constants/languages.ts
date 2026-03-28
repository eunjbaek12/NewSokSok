export const SUPPORTED_LANGUAGES = [
  { code: 'en', flag: '🇺🇸' },
  { code: 'ko', flag: '🇰🇷' },
  { code: 'ja', flag: '🇯🇵' },
  { code: 'zh', flag: '🇨🇳' },
] as const;

export type LanguageCode = typeof SUPPORTED_LANGUAGES[number]['code'];

export function getLanguageFlag(code: string): string {
  return SUPPORTED_LANGUAGES.find(l => l.code === code)?.flag ?? '🌐';
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
