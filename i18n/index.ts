import i18n, { type ResourceLanguage } from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import { type UILocaleCode } from '@shared/contracts';

import { FALLBACK_LOCALE, resolveLocale } from './locale';
import ko from './locales/ko.json';
import en from './locales/en.json';

export const LOCALE_KEY = '@soksok_locale';

// 로케일 해석·표시 메타는 부작용 없는 ./locale에 있다(이 모듈은 import만으로 i18next를
// 초기화하므로, 순수 헬퍼가 그걸 떠안지 않도록 나눠 뒀다). 기존 import 경로를 유지하려고
// 여기서 전부 다시 내보낸다.
export { FALLBACK_LOCALE, UI_LOCALES, localeTag, resolveLocale } from './locale';
export type { UILocaleCode };

function getSystemLocale(): UILocaleCode {
  try {
    const locales = Localization.getLocales();
    return resolveLocale(locales?.[0]?.languageCode);
  } catch {
    return FALLBACK_LOCALE;
  }
}

const resources: Record<UILocaleCode, ResourceLanguage> = {
  ko: { translation: ko },
  en: { translation: en },
};

// Initialize synchronously with system locale; saved preference applied async in LocaleContext
i18n.use(initReactI18next).init({
  resources,
  lng: getSystemLocale(),
  // 키가 빠진 언어에서 한국어가 튀어나오지 않도록 폴백한다. ko/en은 현재
  // 키가 완전히 일치해 폴백이 발동하지 않지만, 세 번째 언어를 추가하는 순간
  // 미번역 키가 생기고 그때 읽히는 쪽이 영어여야 한다.
  fallbackLng: FALLBACK_LOCALE,
  keySeparator: '.',
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
});

export default i18n;
