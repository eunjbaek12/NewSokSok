import i18n, { type ResourceLanguage } from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import { UI_LOCALE_CODES, type UILocaleCode } from '@shared/contracts';

import ko from './locales/ko.json';
import en from './locales/en.json';

export const LOCALE_KEY = '@soksok_locale';

export type { UILocaleCode };

/**
 * 언어별 표시·포맷 메타.
 *
 * Record<UILocaleCode, …>인 것이 핵심이다 — contracts.ts의 enum에 코드를 추가하면
 * 여기(그리고 아래 resources)가 컴파일 에러를 내므로, 번역 JSON 없이 언어가
 * 목록에만 등장하는 상태가 원천적으로 불가능하다.
 *
 * bcp47은 날짜·숫자 포맷용 태그다. 앱 언어와 기기 로케일이 다를 수 있으므로
 * (한국 기기에서 영어 UI를 쓰는 사용자) Intl에 넘길 태그는 여기서 가져와야 한다.
 */
const UI_LOCALE_META: Record<UILocaleCode, { nativeLabel: string; flag: string; bcp47: string }> = {
  ko: { nativeLabel: '한국어', flag: '🇰🇷', bcp47: 'ko-KR' },
  en: { nativeLabel: 'English', flag: '🇺🇸', bcp47: 'en-US' },
};

export const UI_LOCALES = UI_LOCALE_CODES.map((code) => ({
  code,
  ...UI_LOCALE_META[code],
}));

/** 앱 언어에 대응하는 BCP-47 태그. toLocaleDateString·Intl에 넘길 값. */
export function localeTag(code: string): string {
  return UI_LOCALE_META[code as UILocaleCode]?.bcp47 ?? 'en-US';
}

function isSupported(code: string): code is UILocaleCode {
  return (UI_LOCALE_CODES as readonly string[]).includes(code);
}

function getSystemLocale(): UILocaleCode {
  try {
    const locales = Localization.getLocales();
    const systemLang = locales?.[0]?.languageCode;
    if (systemLang && isSupported(systemLang)) {
      return systemLang;
    }
  } catch {}
  return 'ko';
}

const resources: Record<UILocaleCode, ResourceLanguage> = {
  ko: { translation: ko },
  en: { translation: en },
};

// Initialize synchronously with system locale; saved preference applied async in LocaleContext
i18n.use(initReactI18next).init({
  resources,
  lng: getSystemLocale(),
  // 키가 빠진 언어에서 한국어가 튀어나오지 않도록 en으로 폴백한다. ko/en은 현재
  // 키가 완전히 일치해 폴백이 발동하지 않지만, 세 번째 언어를 추가하는 순간
  // 미번역 키가 생기고 그때 읽히는 쪽이 영어여야 한다.
  fallbackLng: 'en',
  keySeparator: '.',
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
});

export default i18n;
