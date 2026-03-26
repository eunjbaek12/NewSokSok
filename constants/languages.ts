export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: '영어', flag: '🇺🇸' },
  { code: 'ko', label: '한국어', flag: '🇰🇷' },
  { code: 'ja', label: '일본어', flag: '🇯🇵' },
  { code: 'zh', label: '중국어', flag: '🇨🇳' },
] as const;

export type LanguageCode = typeof SUPPORTED_LANGUAGES[number]['code'];

export function getLanguageLabel(code: string): string {
  return SUPPORTED_LANGUAGES.find(l => l.code === code)?.label ?? code.toUpperCase();
}

export function getLanguageFlag(code: string): string {
  return SUPPORTED_LANGUAGES.find(l => l.code === code)?.flag ?? '🌐';
}

export function getPlaceholderText(sourceLang: LanguageCode): string {
  const map: Record<LanguageCode, string> = {
    en: 'Enter a word',
    ko: '단어를 입력하세요',
    ja: '単語を入力',
    zh: '输入单词',
  };
  return map[sourceLang] || 'Enter a word';
}

export function getMeaningLabel(targetLang: LanguageCode): string {
  const map: Record<LanguageCode, string> = {
    ko: '한국어 뜻',
    en: '영어 뜻',
    ja: '일본어 뜻',
    zh: '중국어 뜻',
  };
  return map[targetLang] || `${getLanguageLabel(targetLang)} 뜻`;
}

export function getDefinitionLabel(sourceLang: LanguageCode): string {
  const map: Record<LanguageCode, string> = {
    en: '영문 정의',
    ko: '한국어 정의',
    ja: '일본어 정의',
    zh: '중국어 정의',
  };
  return map[sourceLang] || `${getLanguageLabel(sourceLang)} 정의`;
}

export function getExampleTranslationLabel(targetLang: LanguageCode): string {
  return `${getLanguageLabel(targetLang)} 해석`;
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
