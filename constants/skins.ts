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
    characterAccessory: 'lab-goggles',
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
  // 📮 «편지지» — 이름을 2026-09-08 에 Y2K 에서 바꿨다. Y2K 는 Year 2000 이고 그 미학의
  //    본체가 은색·크롬·홀로그램, 곧 **반짝임**인데 이 스킨에는 그런 것이 하나도 없다.
  //    실제로 들어 있던 것은 분홍 파스텔 · 둥근 글꼴(Jua) · 리본 — 2000년대 팬시 문구다.
  //    이름만 어긋나 있었고, 배경 그림도 그 어긋난 이름을 좇다 두 번 헛돌았다.
  //
  // 🔴 **id 는 'y2k' 로 남긴다.** 사용자의 선택은 이 문자열로 저장돼 있어서(skin-store),
  //    바꾸면 이 스킨을 쓰던 사람의 화면이 다음 실행에 기본 스킨으로 돌아간다.
  //    표시 이름은 i18n 의 skinY2k 하나만 갈면 된다.
  y2k: {
    id: 'y2k',
    nameKey: 'skinY2k',
    colorScheme: 'light',
    fontFamily: jua,
    previewColors: {
      background: '#FDF0F8',
      primary: '#D456B8',
      surface: '#FFF5FB',
      // 선택기에서 하늘색을 보여준다 — 분홍 하나만으로는 「분홍 스킨」일 뿐이고,
      // 그 옆의 하늘색이 있어야 2000년대 홈피 스킨으로 읽힌다(autumn 의 은행 노랑과 같은 자리).
      accent: '#3E9FD0',
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
  halloween: {
    id: 'halloween',
    nameKey: 'skinHalloween',
    // 여덟 중 두 번째 다크. dark 는 갈색 밤이고 이쪽은 보랏빛 밤이라 안 겹친다.
    colorScheme: 'dark',
    fontFamily: pretendard,
    previewColors: {
      background: '#191327',
      primary: '#E8873A',
      surface: '#241B36',
      // 선택기에서 독 초록을 보여준다 — 호박 주황 하나만으로는 «어두운 스킨»과
      // 구별되지 않는다. autumn 이 은행 노랑을 두 번째 색으로 둔 것과 같은 이유다.
      accent: '#7FC244',
      text: '#EDE6F2',
    },
    characterAccessory: 'halloween-cape',
  },
};

// 표시 순서 — 기본(classic)이 맨 앞, 나중에 추가한 스킨이 뒤로 간다.
//
// 🚩 autumn·hangul·halloween 은 1.7.x 의 얼굴이라 그때까지 목록에서 뺀다. 팔레트·배경·소품은
//    이미 들어가 있지만 **고를 수가 없으므로** 중간 릴리스에 딸려 나가도 보이지 않는다.
//    공개 빌드에서 이 배열에 더하기만 하면 된다 — skin-store 의 복원 조건은 이 목록에서
//    파생하므로 따로 고칠 곳이 없다. 할로윈은 10/1 이 아니라 10월 말이 제자리다.
//
//    그림이 완성돼 한 번 걷었다가(2026-09-04, c3e864a) 되돌린다 — 완성 여부가 아니라
//    **공개 시점**이 기준이기 때문이다(은정님, 2026-09-07). 미리 나가면 10/1 에 보여 줄
//    새것이 남지 않는다. __tests__/skin-registry.test.ts 가 이 상태를 지킨다.
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
  if (id === 'halloween') return Colors.halloween;
  return Colors.light;
}
