import React, { createContext, useContext, useState, useMemo, useCallback, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n, { LOCALE_KEY, UI_LOCALES, type UILocaleCode } from '@/i18n';

interface LocaleContextValue {
  locale: UILocaleCode;
  setLocale: (code: UILocaleCode) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<UILocaleCode>(i18n.language as UILocaleCode);

  useEffect(() => {
    AsyncStorage.getItem(LOCALE_KEY).then((saved) => {
      if (saved && UI_LOCALES.some((l) => l.code === saved)) {
        const code = saved as UILocaleCode;
        setLocaleState(code);
        i18n.changeLanguage(code);
      }
    });
  }, []);

  const setLocale = useCallback((code: UILocaleCode) => {
    setLocaleState(code);
    i18n.changeLanguage(code);
    AsyncStorage.setItem(LOCALE_KEY, code);
  }, []);

  const value = useMemo(() => ({
    locale,
    setLocale,
  }), [locale, setLocale]);

  return (
    <LocaleContext value={value}>
      {children}
    </LocaleContext>
  );
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider');
  return ctx;
}
