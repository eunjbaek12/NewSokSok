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
    nameKo: '실험실',
    nameEn: 'Lab',
    colorScheme: 'light',
    fontFamily: pretendard,
    previewColors: {
      background: '#F0F2F5',
      primary: '#0891B2',
      surface: '#FFFFFF',
      accent: '#06B6D4',
    },
    characterAccessory: 'none',
  },
  classic: {
    id: 'classic',
    nameKo: '클래식',
    nameEn: 'Classic',
    colorScheme: 'light',
    fontFamily: pretendard,
    previewColors: {
      background: '#F5EDE3',
      primary: '#2A7B78',
      surface: '#FFF8F2',
      accent: '#C46B3A',
    },
    characterAccessory: 'none',
  },
  dark: {
    id: 'dark',
    nameKo: '다크 고요',
    nameEn: 'Dark',
    colorScheme: 'dark',
    fontFamily: pretendard,
    previewColors: {
      background: '#1C1410',
      primary: '#1F6764',
      surface: '#281E18',
      accent: '#D4784A',
    },
    characterAccessory: 'none',
  },
  y2k: {
    id: 'y2k',
    nameKo: 'Y2K',
    nameEn: 'Y2K',
    colorScheme: 'light',
    fontFamily: jua,
    previewColors: {
      background: '#FDF0F8',
      primary: '#D456B8',
      surface: '#FFF5FB',
      accent: '#8B50D4',
    },
    characterAccessory: 'y2k-ribbon',
  },
};

export const SKIN_LIST: SkinDefinition[] = [SKINS.classic, SKINS.dark, SKINS.y2k, SKINS.lab];

export const LEGACY_THEME_TO_SKIN: Record<string, SkinId> = {
  light: 'classic',
  dark: 'dark',
};

export function getSkinColors(id: SkinId): ThemeColors {
  if (id === 'dark') return Colors.dark;
  if (id === 'y2k') return Colors.y2k;
  if (id === 'lab') return Colors.lab;
  return Colors.light;
}
