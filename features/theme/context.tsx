import React, { createContext, useContext, useMemo, useCallback, ReactNode } from 'react';
import { useSkinStore } from './skin-store';
import { SKINS, getSkinColors } from '@/constants/skins';
import type { SkinId, SkinDefinition, FontFamily } from './types';
import type { ThemeMode } from '@/lib/types';

type ThemeColors = ReturnType<typeof getSkinColors>;

interface ThemeContextValue {
  // New skin API
  skinId: SkinId;
  skin: SkinDefinition;
  fontFamily: FontFamily;
  setSkin: (id: SkinId) => Promise<void>;

  // Legacy API (maintained for backward compatibility)
  mode: ThemeMode;
  colors: ThemeColors;
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (m: 'light' | 'dark') => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { skinId, setSkin } = useSkinStore();

  const skin = SKINS[skinId];
  const colors = getSkinColors(skinId);
  const isDark = skin.colorScheme === 'dark';

  const toggleTheme = useCallback(() => {
    setSkin(isDark ? 'classic' : 'dark');
  }, [isDark, setSkin]);

  const setTheme = useCallback((m: 'light' | 'dark') => {
    setSkin(m === 'dark' ? 'dark' : 'classic');
  }, [setSkin]);

  const value = useMemo<ThemeContextValue>(() => ({
    skinId,
    skin,
    fontFamily: skin.fontFamily,
    setSkin,
    mode: skinId as ThemeMode,
    colors,
    isDark,
    toggleTheme,
    setTheme,
  }), [skinId, skin, colors, isDark, toggleTheme, setTheme, setSkin]);

  return (
    <ThemeContext value={value}>
      {children}
    </ThemeContext>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
