import React, { createContext, useContext, useState, useMemo, useCallback, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';
import Colors from '@/constants/colors';
import { ThemeMode } from '@/lib/types';

const THEME_KEY = '@soksok_theme';

type ThemeColors = typeof Colors.light;

interface ThemeContextValue {
  mode: ThemeMode;
  colors: ThemeColors;
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>(systemScheme === 'dark' ? 'dark' : 'light');

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((saved) => {
      if (saved === 'light' || saved === 'dark') {
        setMode(saved);
      }
    });
  }, []);

  const isDark = mode === 'dark';
  const colors = isDark ? Colors.dark : Colors.light;

  const toggleTheme = useCallback(() => {
    const next = isDark ? 'light' : 'dark';
    setMode(next);
    AsyncStorage.setItem(THEME_KEY, next);
  }, [isDark]);

  const setThemeMode = useCallback((m: ThemeMode) => {
    setMode(m);
    AsyncStorage.setItem(THEME_KEY, m);
  }, []);

  const value = useMemo(() => ({
    mode,
    colors,
    isDark,
    toggleTheme,
    setTheme: setThemeMode,
  }), [mode, colors, isDark, toggleTheme, setThemeMode]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
