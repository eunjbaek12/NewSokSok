import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

import ko from './locales/ko.json';
import en from './locales/en.json';

export const LOCALE_KEY = '@soksok_locale';

export const UI_LOCALES = [
  { code: 'ko' as const, label: '한국어', nativeLabel: '한국어', flag: '🇰🇷' },
  { code: 'en' as const, label: 'English', nativeLabel: 'English', flag: '🇺🇸' },
];

export type UILocaleCode = (typeof UI_LOCALES)[number]['code'];

const SUPPORTED_CODES = UI_LOCALES.map((l) => l.code);

function getSystemLocale(): UILocaleCode {
  try {
    const locales = Localization.getLocales();
    const systemLang = locales?.[0]?.languageCode;
    if (systemLang && SUPPORTED_CODES.includes(systemLang as UILocaleCode)) {
      return systemLang as UILocaleCode;
    }
  } catch {}
  return 'ko';
}

// Initialize synchronously with system locale; saved preference applied async in LocaleContext
i18n.use(initReactI18next).init({
  resources: {
    ko: { translation: ko },
    en: { translation: en },
  },
  lng: getSystemLocale(),
  fallbackLng: 'ko',
  keySeparator: '.',
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
});

export default i18n;
