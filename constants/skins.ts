import Colors from './colors';
import type { SkinId, SkinDefinition } from '@/features/theme/types';

type ThemeColors = typeof Colors.light;

const pretendard = {
  regular: 'Pretendard_400Regular',
  medium: 'Pretendard_500Medium',
  semiBold: 'Pretendard_600SemiBold',
  bold: 'Pretendard_700Bold',
};

const jua = {
  regular: 'Jua_400Regular',
  medium: 'Jua_400Regular',
  semiBold: 'Jua_400Regular',
  bold: 'Jua_400Regular',
};

export const SKINS: Record<SkinId, SkinDefinition> = {
  lab: {
    id: 'lab',
    nameKey: 'skinLab',
    colorScheme: 'light',
    fontFamily: pretendard,
    previewColors: {
      background: '#F0F2F5',
      primary: '#0891B2',
      surface: '#FFFFFF',
      accent: '#06B6D4',
      text: '#111827',
    },
    characterAccessory: 'none',
  },
  classic: {
    id: 'classic',
    nameKey: 'skinClassic',
    colorScheme: 'light',
    fontFamily: pretendard,
    previewColors: {
      background: '#F5EDE3',
      primary: '#2A7B78',
      surface: '#FFF8F2',
      accent: '#C46B3A',
      text: '#2A1A0A',
    },
    characterAccessory: 'none',
  },
  dark: {
    id: 'dark',
    nameKey: 'skinDark',
    colorScheme: 'dark',
    fontFamily: pretendard,
    previewColors: {
      background: '#1C1410',
      primary: '#1F6764',
      surface: '#281E18',
      accent: '#D4784A',
      text: '#F0E8DC',
    },
    characterAccessory: 'none',
  },
  y2k: {
    id: 'y2k',
    nameKey: 'skinY2k',
    colorScheme: 'light',
    fontFamily: jua,
    previewColors: {
      background: '#FDF0F8',
      primary: '#D456B8',
      surface: '#FFF5FB',
      accent: '#8B50D4',
      text: '#3A1A3A',
    },
    characterAccessory: 'y2k-ribbon',
  },
  ocean: {
    id: 'ocean',
    nameKey: 'skinOcean',
    colorScheme: 'light',
    fontFamily: pretendard,
    previewColors: {
      background: '#EAF6F7',
      primary: '#0C7178',
      surface: '#F5FBFB',
      accent: '#FF7F5C',
      text: '#0B2E33',
    },
    characterAccessory: 'ocean-hat',
  },
};

export const SKIN_LIST: SkinDefinition[] = [SKINS.classic, SKINS.ocean, SKINS.dark, SKINS.y2k, SKINS.lab];

export const LEGACY_THEME_TO_SKIN: Record<string, SkinId> = {
  light: 'classic',
  dark: 'dark',
};

export function getSkinColors(id: SkinId): ThemeColors {
  if (id === 'dark') return Colors.dark;
  if (id === 'y2k') return Colors.y2k;
  if (id === 'lab') return Colors.lab;
  if (id === 'ocean') return Colors.ocean;
  return Colors.light;
}
