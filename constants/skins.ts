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

// 한글 스킨 전용 명조. Jua 가 한 굵기뿐인 것과 달리 두 굵기가 있어,
// 제목과 본문의 위계가 살아 있다 — 학습 화면의 긴 예문에 그 차이가 중요하다.
const gowunBatang = {
  regular: 'GowunBatang_400Regular',
  medium: 'GowunBatang_400Regular',
  semiBold: 'GowunBatang_700Bold',
  bold: 'GowunBatang_700Bold',
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
  autumn: {
    id: 'autumn',
    nameKey: 'skinAutumn',
    colorScheme: 'light',
    fontFamily: pretendard,
    previewColors: {
      background: '#F7E9D7',
      primary: '#A8442A',
      surface: '#FFF8EE',
      // 선택기에서 은행 노랑을 보여준다 — 단풍 빨강(primary)과 나란히 놓였을 때
      // 가을이라고 읽히게 하는 것은 이 두 번째 색이다.
      accent: '#D9A22B',
      text: '#3A241A',
    },
    characterAccessory: 'autumn-leaf',
  },
  hangul: {
    id: 'hangul',
    nameKey: 'skinHangul',
    colorScheme: 'light',
    // 일곱 중 유일하게 명조를 쓴다. 먹·한지와 맞아떨어져 개성이 가장 뚜렷하다.
    // ⚠️ 명조는 작아질수록 획이 가늘어진다 — 학습 화면의 긴 예문을 실기로 볼 것.
    fontFamily: gowunBatang,
    previewColors: {
      background: '#F4EFE3',
      primary: '#333A3F',
      surface: '#FCF9F2',
      accent: '#1F5C8C',
      text: '#22201C',
    },
    characterAccessory: 'hangul-gat',
  },
};

// 표시 순서 — 기본(classic)이 맨 앞, 나중에 추가한 스킨이 뒤로 간다.
//
// 🚩 autumn·hangul 은 1.7.0(10/1)의 얼굴이라 그때까지 목록에서 뺀다. 팔레트·배경·
//    소품은 이미 들어가 있지만 **고를 수가 없으므로** 중간 릴리스에 딸려 나가도
//    보이지 않는다. 10/1 빌드에서 이 배열에 둘을 더하기만 하면 된다 —
//    skin-store 의 복원 조건은 이 목록에서 파생하므로 따로 고칠 곳이 없다.
//    __tests__/skin-registry.test.ts 가 그때 실패해 "걷었다"는 사실을 커밋에 남긴다.
export const SKIN_LIST: SkinDefinition[] = [SKINS.classic, SKINS.dark, SKINS.y2k, SKINS.lab, SKINS.ocean];

export const LEGACY_THEME_TO_SKIN: Record<string, SkinId> = {
  light: 'classic',
  dark: 'dark',
};

export function getSkinColors(id: SkinId): ThemeColors {
  if (id === 'dark') return Colors.dark;
  if (id === 'y2k') return Colors.y2k;
  if (id === 'lab') return Colors.lab;
  if (id === 'ocean') return Colors.ocean;
  if (id === 'autumn') return Colors.autumn;
  if (id === 'hangul') return Colors.hangul;
  return Colors.light;
}
