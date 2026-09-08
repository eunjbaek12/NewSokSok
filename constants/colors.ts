/**
 * 복습 배너(gentle SRS) 그라디언트 — 아보카도 그린. docs/gentle-srs-design.md §5.2 D12.
 *
 * 맞춤학습 카드가 이미 `accentActionGradient`(티에이룰)를 쓴다. 배너가 같은 색이면
 * 주인공이 아니라 경쟁자로 읽혀 "사이에 낀 것"처럼 보이므로 브랜드 그린으로 분리한다.
 *
 * 밝은 쪽 스톱이 흰 텍스트 대비 4.5:1을 넘어야 해서 값이 깊다. 브랜드 그린 `#6AB045`는
 * 2.66:1로 한참 미달이고, 설계가 제안한 `#4C8A2E`도 실측 4.22:1로 아슬하게 모자라
 * `#488325`(4.62:1)로 한 단계 더 내렸다. 어두운 쪽 `#2F5C18`은 7.88:1.
 * 네 테마 모두 같은 값 — 어느 테마에서도 브랜드 그린으로 읽혀야 하기 때문.
 */
const REVIEW_GRADIENT = ['#488325', '#2F5C18'] as readonly [string, string];

const Colors = {
  light: {
    primary: '#2A7B78',
    primaryButton: '#2A7B78',
    primaryLight: '#D8EFEE',
    secondary: '#C46B3A',
    secondaryLight: '#FAE8DC',
    accent: '#C46B3A',
    accentLight: '#FAE8DC',
    accentAction: '#4A7DFF',
    accentActionLight: '#E5EDFF',
    accentActionGradient: ['#2A7B78', '#1F5C5A'] as readonly [string, string],
    reviewGradient: REVIEW_GRADIENT,
    background: '#F5EDE3',
    surface: '#FFF8F2',
    surfaceSecondary: '#EDE0D4',
    text: '#2A1A0A',
    textSecondary: '#6A4A38',
    textTertiary: '#9A7A68',
    success: '#2A7B78',
    successButton: '#226460',
    successLight: '#D8EFEE',
    error: '#C94B2D',
    errorLight: '#FDEAE4',
    warning: '#C46B3A',
    warningLight: '#FAE8DC',
    border: '#BCA898',
    borderLight: '#D0C0B0',
    tint: '#2A7B78',
    tabIconDefault: '#9A7A68',
    tabIconSelected: '#2A7B78',
    cardShadow: 'rgba(42,26,10,0.08)',
    overlay: 'rgba(42,26,10,0.4)',
    surfaceModal: '#EEE0D0',
    onPrimary: '#FFFFFF',
    shadow: '#000000',
    starGold: '#FFD700',
    hintBg: '#FFF9C4',
    hintBorder: '#FFEE58',
    hintText: '#856404',
    icons: {
      memorization: '#10B981',
      shuffle: '#9333EA',
      sound: '#FF5722',
      timing: '#F59E0B',
      language: '#14B8A6',
      chat: '#EC4899',
    },
    brand: {
      green: '#6AB045',
      greenLight: '#E8F5DC',
      greenDark: '#3D7020',
      googleBlue: '#4285F4',
      naverGreen: '#03C75A',
    },
    difficulty: {
      beginnerBg: '#DCFCE7',
      beginnerText: '#16A34A',
      intermediateBg: '#DBEAFE',
      intermediateText: '#2563EB',
      advancedBg: '#FEE2E2',
      advancedText: '#DC2626',
    },
  },
  dark: {
    primary: '#1F6764',
    primaryButton: '#1F6764',
    primaryLight: '#0E2828',
    secondary: '#D4784A',
    secondaryLight: '#3A1C0C',
    accent: '#D4784A',
    accentLight: '#3A1C0C',
    accentAction: '#6B95FF',
    accentActionLight: '#1A2540',
    accentActionGradient: ['#1F6764', '#1F5C5A'] as readonly [string, string],
    reviewGradient: REVIEW_GRADIENT,
    background: '#1C1410',
    surface: '#281E18',
    surfaceSecondary: '#342820',
    text: '#F0E8DC',
    textSecondary: '#C0A08A',
    textTertiary: '#806050',
    success: '#1F6764',
    successButton: '#1F6764',
    successLight: '#0E2828',
    error: '#E05A3A',
    errorLight: '#3D1508',
    warning: '#D4784A',
    warningLight: '#3A1C0C',
    border: '#483830',
    borderLight: '#342820',
    tint: '#1F6764',
    tabIconDefault: '#806050',
    tabIconSelected: '#1F6764',
    cardShadow: 'rgba(0,0,0,0.22)',
    overlay: 'rgba(0,0,0,0.6)',
    surfaceModal: '#281E18',
    onPrimary: '#FFFFFF',
    shadow: '#000000',
    starGold: '#E8C766',
    hintBg: '#3D3D29',
    hintBorder: '#A88A2C',
    hintText: '#FDE68A',
    icons: {
      memorization: '#5DBFA0',
      shuffle: '#B58CE0',
      sound: '#E8855C',
      timing: '#E0B070',
      language: '#5BB5AC',
      chat: '#D97AAA',
    },
    brand: {
      green: '#A8D585',
      greenLight: '#1F3818',
      greenDark: '#C8E8A8',
      googleBlue: '#5A95F5',
      naverGreen: '#5BC080',
    },
    difficulty: {
      beginnerBg: 'rgba(22,163,74,0.2)',
      beginnerText: '#6FD193',
      intermediateBg: 'rgba(37,99,235,0.2)',
      intermediateText: '#7AB0F0',
      advancedBg: 'rgba(220,38,38,0.2)',
      advancedText: '#E89090',
    },
  },
  // 실험실 — y2k 와 같이 상태색 0/7 이었다. 차가운 시안 스킨에 주황 warning `#C46B3A` 이
  // 남아 있었고, 진행막대의 success 가 클래식 청록이라 계획하기의 시안과 두 색이 공존했다.
  // 에메랄드 success · 순수 빨강 error · 앰버 warning 으로 계열을 맞춘다.
  lab: {
    primary: '#0891B2',
    primaryButton: '#0891B2',
    primaryLight: '#CFFAFE',
    secondary: '#0E7490',
    secondaryLight: '#A5F3FC',
    accent: '#06B6D4',
    accentLight: '#CFFAFE',
    accentAction: '#0891B2',
    accentActionLight: '#E0F7FA',
    accentActionGradient: ['#0891B2', '#0E7490'] as readonly [string, string],
    reviewGradient: REVIEW_GRADIENT,
    background: '#F0F2F5',
    surface: '#FFFFFF',
    surfaceSecondary: '#E2E6ED',
    surfaceModal: '#E2E6ED',
    text: '#111827',
    textSecondary: '#4B5563',
    textTertiary: '#9CA3AF',
    onPrimary: '#FFFFFF',
    success: '#047857',
    successButton: '#036347',
    successLight: '#D6EDE5',
    error: '#CF3128',
    errorLight: '#FBE3E1',
    warning: '#B45309',
    warningLight: '#FBEDDD',
    border: '#CBD2DC',
    borderLight: '#DDE2EA',
    tint: '#0891B2',
    tabIconDefault: '#9CA3AF',
    tabIconSelected: '#0891B2',
    cardShadow: 'rgba(8,145,178,0.08)',
    overlay: 'rgba(17,24,39,0.45)',
    shadow: '#000000',
    starGold: '#FFD700',
    hintBg: '#ECFEFF',
    hintBorder: '#A5F3FC',
    hintText: '#0E7490',
    icons: {
      memorization: '#0891B2',
      shuffle: '#0E7490',
      sound: '#06B6D4',
      timing: '#6366F1',
      language: '#0891B2',
      chat: '#22D3EE',
    },
    brand: {
      green: '#6AB045',
      greenLight: '#E8F5DC',
      greenDark: '#3D7020',
      googleBlue: '#4285F4',
      naverGreen: '#03C75A',
    },
    difficulty: {
      beginnerBg: '#DCFCE7',
      beginnerText: '#16A34A',
      intermediateBg: '#DBEAFE',
      intermediateText: '#2563EB',
      advancedBg: '#FEE2E2',
      advancedText: '#DC2626',
    },
  },
  // 🩵 두 번째 축 = 하늘색 (2026-09-08). 그 전까지 이 스킨은 팔레트 일곱 값의 색상이
  //    267~324도 **한 덩어리**여서(다른 스킨은 둘~셋으로 갈린다: ocean 180/0 · autumn 0/30 ·
  //    halloween 30/90/270) 「분홍 스킨」으로만 읽히고 시대도 장소도 붙지 않았다.
  //    autumn 의 은행 노랑, halloween 의 독 초록이 하는 일을 여기서는 하늘색이 한다 —
  //    2000년대 개인 홈피 스킨에서 분홍과 하늘색은 기본 짝이었다.
  //
  // 🔴 **밝은 하늘색은 글자에 못 쓴다.** `#3E9FD0` 은 배경 위 2.68 로 지금 값(보라 4.53)에
  //    한참 못 미친다. 그래서 ocean 이 이미 한 대로 **둘로 가른다** — 글자·버튼은 진한
  //    `#1F7FB0`(4.02 · 흰 글자 4.45), 아이콘과 선택기 미리보기는 밝은 `#3E9FD0`.
  //    (ocean 주석의 「밝은 산호는 강조 텍스트에 못 쓰고 장식·아이콘용」과 같은 자리다.)
  //
  // Y2K — 상태색 일곱이 전부 클래식 그대로였다(2026-09-08 실측: 0/7). primary 가 분홍
  // `#D456B8`(h313)인데 success 가 청록 `#2A7B78`(h178)이라 한 화면에 브랜드색이 둘이었다.
  // autumn·hangul·halloween 이 한 것과 같은 방식으로 옮긴다 — **초록 계열은 유지하되
  // 그 스킨의 톤으로**(가을 올리브 · 한글 단청녹 · 할로윈 독초록). 여기서는 차가운 민트다.
  //
  // 🔴 잣대는 4.5:1 이 아니다. 이 앱의 상태색은 **원래 4.5 를 안 지킨다** — 클래식조차
  //    success 4.31 · error 4.00 · warning 3.29 다. 앱 전반이 안 지키는 값을 근거로 삼으면
  //    셋만 고쳐 놓고 나머지와 어긋난다. 그래서 목표는 대비 개선이 아니라 **톤 일치**이고,
  //    기존 스킨의 범위(success 4.09~5.36 · error 4.00~5.53 · warning 3.04~4.04) 안에
  //    들어가는지로만 본다. textTertiary 를 포함한 대비 전반은 별건이다.
  y2k: {
    primary: '#D456B8',
    primaryButton: '#D456B8',
    primaryLight: '#FAD8F5',
    secondary: '#1F7FB0',
    secondaryLight: '#D8ECF7',
    accent: '#D456B8',
    accentLight: '#FAD8F5',
    accentAction: '#1F7FB0',
    accentActionLight: '#E2F1FA',
    accentActionGradient: ['#D456B8', '#2A86BC'] as readonly [string, string],
    reviewGradient: REVIEW_GRADIENT,
    background: '#FDF0F8',
    surface: '#FFF5FB',
    surfaceSecondary: '#F5DCF0',
    surfaceModal: '#F5DCF0',
    text: '#3A1A3A',
    textSecondary: '#7A4578',
    textTertiary: '#B088AE',
    onPrimary: '#FFFFFF',
    success: '#0E7A63',
    successButton: '#0A6A55',
    successLight: '#D6EFE7',
    error: '#C42B54',
    errorLight: '#FBE0E8',
    warning: '#C4761F',
    warningLight: '#FAEBD8',
    border: '#E8B0DE',
    borderLight: '#EDD4E8',
    tint: '#D456B8',
    tabIconDefault: '#B088AE',
    tabIconSelected: '#D456B8',
    cardShadow: 'rgba(180,80,180,0.10)',
    overlay: 'rgba(60,0,60,0.4)',
    shadow: '#000000',
    starGold: '#FFD700',
    hintBg: '#FEF2FA',
    hintBorder: '#E8B0DE',
    hintText: '#7A4578',
    icons: {
      memorization: '#D456B8',
      shuffle: '#3E9FD0',
      sound: '#E879D8',
      timing: '#5AB2DC',
      language: '#C060B8',
      chat: '#E0A0D8',
    },
    brand: {
      green: '#6AB045',
      greenLight: '#E8F5DC',
      greenDark: '#3D7020',
      googleBlue: '#4285F4',
      naverGreen: '#03C75A',
    },
    difficulty: {
      beginnerBg: '#DCFCE7',
      beginnerText: '#16A34A',
      intermediateBg: '#DBEAFE',
      intermediateText: '#2563EB',
      advancedBg: '#FEE2E2',
      advancedText: '#DC2626',
    },
  },
  // 여름 바다(맑은 대낮) — light 구조를 딥 오션 틸 + 모래/산호로 치환.
  // 딥 오션 primary #0C7178은 배경 위 5.21:1·흰 글씨 위 5.76:1(둘 다 4.5 여유).
  // 밝은 산호 #FF7F5C는 흰 글씨 대비가 낮아 강조 텍스트/버튼엔 못 쓰고
  // 장식(파도·모자)·아이콘용. 강조 텍스트/뱃지는 진한 코랄 #D94F30.
  //
  // 🔧 2026-09-08 — 이 스킨은 상태색을 5/7 만 갈라 뒀고 error 가 클래식 벽돌빛이었다.
  //    산호빛으로 옮긴다. icons 여섯과 hint 셋은 **하나도 안 갈라져 있었다**(민트·보라·
  //    핫핑크 아이콘, 노란 포스트잇 힌트) — 바다 톤으로 옮긴다. timing 하나만 코랄을
  //    쓰는 것은 lab 이 인디고 하나를 쓰는 것과 같은 자리다(여섯이 다 틸이면 구분이 죽는다).
  ocean: {
    primary: '#0C7178',
    primaryButton: '#0C7178',
    primaryLight: '#CDEBED',
    secondary: '#D94F30',
    secondaryLight: '#FCE6DF',
    accent: '#D94F30',
    accentLight: '#FCE6DF',
    accentAction: '#0C7178',
    accentActionLight: '#D6EFF1',
    accentActionGradient: ['#0C7178', '#0A5157'] as readonly [string, string],
    reviewGradient: REVIEW_GRADIENT,
    background: '#EAF6F7',
    surface: '#F5FBFB',
    surfaceSecondary: '#DCEEF0',
    text: '#0B2E33',
    textSecondary: '#3A6168',
    textTertiary: '#6E9298',
    success: '#0C7178',
    successButton: '#0A6067',
    successLight: '#CDEBED',
    error: '#C4402A',
    errorLight: '#FBE5DF',
    warning: '#D98A2B',
    warningLight: '#FBEFD9',
    border: '#B4D6DA',
    borderLight: '#CFE6E8',
    tint: '#0C7178',
    tabIconDefault: '#6E9298',
    tabIconSelected: '#0C7178',
    cardShadow: 'rgba(11,46,51,0.10)',
    overlay: 'rgba(11,46,51,0.4)',
    surfaceModal: '#E4F2F3',
    onPrimary: '#FFFFFF',
    shadow: '#000000',
    starGold: '#FFD700',
    hintBg: '#E4F4F5',
    hintBorder: '#9BD3D8',
    hintText: '#0A5157',
    icons: {
      memorization: '#0C7178',
      shuffle: '#0A5157',
      sound: '#14A0A8',
      timing: '#D94F30',
      language: '#0C7178',
      chat: '#57C3C9',
    },
    brand: {
      green: '#6AB045',
      greenLight: '#E8F5DC',
      greenDark: '#3D7020',
      googleBlue: '#4285F4',
      naverGreen: '#03C75A',
    },
    difficulty: {
      beginnerBg: '#DCFCE7',
      beginnerText: '#16A34A',
      intermediateBg: '#DBEAFE',
      intermediateText: '#2563EB',
      advancedBg: '#FEE2E2',
      advancedText: '#DC2626',
    },
  },

  // 가을 단풍 — 여섯 번째 스킨. 기존 다섯의 primary 가 청록 둘·분홍·시안·민트라
  // **따뜻한 primary 가 하나도 없었다.** 단풍 빨강이 그 빈자리를 채운다.
  // 배경 그림: assets/images/skin-autumn-bg.webp (docs/skin-art-brief.md)
  autumn: {
    primary: '#A8442A',
    primaryButton: '#A8442A',
    primaryLight: '#F6DACE',
    secondary: '#8A5D18',
    secondaryLight: '#F5E4C4',
    accent: '#8A5D18',
    accentLight: '#F5E4C4',
    accentAction: '#A8442A',
    accentActionLight: '#F6DACE',
    accentActionGradient: ['#A8442A', '#7E2F1B'] as readonly [string, string],
    reviewGradient: REVIEW_GRADIENT,
    background: '#F7E9D7',
    surface: '#FFF8EE',
    surfaceSecondary: '#F0DFC8',
    text: '#3A241A',
    // 배경 그림 위에 얹히는 보조 글자라 기본값보다 한 단계 진하다.
    // 실기에서 낙엽 무늬 위 "학습 2개 진행 중"이 눌리는 것을 보고 내렸다.
    textSecondary: '#6B4B36',
    textTertiary: '#9A7A62',
    success: '#5E7A2E',
    successButton: '#4C6524',
    successLight: '#E8EFD6',
    error: '#B3392A',
    errorLight: '#FBE4DE',
    warning: '#B8791F',
    warningLight: '#FAEDD3',
    border: '#E3CDB0',
    borderLight: '#EFDFC8',
    tint: '#A8442A',
    tabIconDefault: '#9A7A62',
    tabIconSelected: '#A8442A',
    cardShadow: 'rgba(58,36,26,0.10)',
    overlay: 'rgba(58,36,26,0.4)',
    surfaceModal: '#F3E3CE',
    onPrimary: '#FFFFFF',
    shadow: '#000000',
    starGold: '#D9A22B',
    // 🔧 2026-09-08 — 힌트 셋과 아이콘 여섯이 클래식 그대로였다(노란 포스트잇 · 민트/보라/
    //    핫핑크 아이콘). 노란 힌트는 이 스킨에서 특히 나쁘다 — 바탕 #FFF9C4 가 카드면
    //    #FFF8EE 과 **1.02:1** 이라 면이 사실상 안 보이고 점선 테두리로만 읽혔다.
    //    은행잎 노랑으로 내려 면이 서게 한다(1.14:1, 글자 대비 8.18:1).
    hintBg: '#F9E9BE',
    hintBorder: '#D9A22B',
    hintText: '#5C3D0F',
    // 학습 설정 모달의 16px 아이콘 여섯. 클래식의 «색상 배치»(초록·보라·주황·호박·틸·핑크)는
    // 지키되 가을이 실제로 가진 것으로 옮겼다 — 가을 팔레트는 따뜻한 좁은 띠라 여섯을 다
    // 단풍·은행으로 채우면 구분이 죽는다. 그래서 올리브와 솔이끼 둘을 찬 쪽 균형추로 둔다.
    icons: {
      memorization: '#5E7A2E', // 올리브 = success. 「외운다」와 뜻이 맞는다
      shuffle: '#7A3A52',      // 머루 자주 — 보라 자리. 여섯 중 유일한 자주
      sound: '#A8442A',        // 단풍 = primary
      timing: '#A06A15',       // 은행
      language: '#3F6B57',     // 솔이끼 — 틸 자리
      chat: '#C4703F',         // 홍시. 여섯 중 가장 밝아 단풍과 명도로 갈린다
    },
    brand: {
      green: '#6AB045',
      greenLight: '#E8F5DC',
      greenDark: '#3D7020',
      googleBlue: '#4285F4',
      naverGreen: '#03C75A',
    },
    difficulty: {
      beginnerBg: '#DCFCE7',
      beginnerText: '#16A34A',
      intermediateBg: '#DBEAFE',
      intermediateText: '#2563EB',
      advancedBg: '#FEE2E2',
      advancedText: '#DC2626',
    },
  },

  // 한글 — 일곱 번째. 한옥의 재료 넷을 그대로 쓴다: 기와·나무·한지·단청.
  // 일곱 중 유일하게 채도를 거의 버린 스킨이고, 대비가 가장 높다.
  // 배경 그림은 경복궁 수정전 — 집현전이 있던 자리에 1867 년 중건된 건물이다.
  hangul: {
    primary: '#333A3F',
    primaryButton: '#333A3F',
    primaryLight: '#DFE1E2',
    secondary: '#8B6A42',
    secondaryLight: '#EDE3D3',
    accent: '#1F5C8C',
    accentLight: '#DCE7F1',
    accentAction: '#1F5C8C',
    accentActionLight: '#DCE7F1',
    accentActionGradient: ['#1F5C8C', '#164363'] as readonly [string, string],
    reviewGradient: REVIEW_GRADIENT,
    background: '#F4EFE3',
    surface: '#FCF9F2',
    surfaceSecondary: '#E9E2D3',
    text: '#22201C',
    // 기와 무늬 위에 얹히므로 기본값(#6B6459)보다 진하게 — 위 autumn 과 같은 이유.
    textSecondary: '#4A443A',
    textTertiary: '#7C7466',
    success: '#3F6B4A',
    successButton: '#33573C',
    successLight: '#DDE9E0',
    error: '#9E3B2F',
    errorLight: '#F6E2DF',
    warning: '#9A6B22',
    warningLight: '#F3E7D2',
    border: '#C9AC82',
    borderLight: '#DED3BE',
    tint: '#333A3F',
    tabIconDefault: '#7C7466',
    tabIconSelected: '#333A3F',
    cardShadow: 'rgba(34,32,28,0.10)',
    overlay: 'rgba(34,32,28,0.4)',
    surfaceModal: '#EFE9DC',
    onPrimary: '#FCF9F2',
    shadow: '#000000',
    starGold: '#C89A3C',
    // 🔧 2026-09-08 — 여기도 클래식 그대로였다. 노란 포스트잇은 한지면 #FCF9F2 과 1.19:1 로
    //    묻히고, 무엇보다 이 스킨이 버린 채도를 힌트 하나가 되살려 놓는다.
    //    단청 청(accentLight/accent/그라디언트 끝)으로 옮긴다 — 새 값을 만들지 않았다.
    hintBg: '#DCE7F1',
    hintBorder: '#1F5C8C',
    hintText: '#164363',
    // 🔑 아이콘 여섯을 **이 팔레트가 이미 가진 여섯**으로 채운다. 단청의 오방색과 한옥 재료
    //    넷이 그대로 여섯 자리를 메우므로 새 색을 지어낼 이유가 없었다. 다른 스킨과 달리
    //    색상이 넓게 벌어지는 것도 이 덕분이다(먹·나무·적·황·청·뇌록).
    icons: {
      memorization: '#3F6B4A', // 뇌록 = success
      shuffle: '#8B6A42',      // 나무 = secondary
      sound: '#9E3B2F',        // 단청 적 = error
      timing: '#9A6B22',       // 치자 황 = warning
      language: '#1F5C8C',     // 단청 청 = accent
      chat: '#333A3F',         // 기와 먹 = primary
    },
    brand: {
      green: '#6AB045',
      greenLight: '#E8F5DC',
      greenDark: '#3D7020',
      googleBlue: '#4285F4',
      naverGreen: '#03C75A',
    },
    difficulty: {
      beginnerBg: '#DCFCE7',
      beginnerText: '#16A34A',
      intermediateBg: '#DBEAFE',
      intermediateText: '#2563EB',
      advancedBg: '#FEE2E2',
      advancedText: '#DC2626',
    },
  },

  // 할로윈 — 여덟 번째이자 **두 번째 다크 스킨**. 기존 dark 는 갈색 계열(#1C1410)이라
  // 보랏빛 밤과 겹치지 않는다. 색이 남아 있지 않아 «밤»으로 갔다: 주황은 autumn(단풍
  // #A8442A·은행 #D9A22B)과 dark 액센트(#D4784A)가, 보라는 y2k 액센트(#8B50D4)가 쓴다.
  //
  // 🔴 **onPrimary 가 여덟 중 유일하게 어둡다.** primary 가 밝은 호박 주황이라 흰 글자는
  //    2.64:1 로 미달이고, 바탕색(#191327)을 얹으면 6.84:1 이다. 다른 스킨을 베껴
  //    '#FFFFFF' 로 두면 버튼 글자가 읽히지 않는다.
  halloween: {
    primary: '#E8873A',
    primaryButton: '#E8873A',
    primaryLight: '#3A2410',
    secondary: '#7FC244',
    secondaryLight: '#1F2F14',
    // 독 초록. 호박 주황 옆에 이 색이 있어야 «할로윈»으로 읽힌다 — autumn 의 은행 노랑과
    // 같은 자리다(빨강만 있으면 그냥 따뜻한 종이이듯, 주황만 있으면 그냥 어두운 스킨이다).
    accent: '#7FC244',
    accentLight: '#1F2F14',
    accentAction: '#A97BE8',
    accentActionLight: '#2C2044',
    accentActionGradient: ['#E8873A', '#B95F23'] as readonly [string, string],
    reviewGradient: REVIEW_GRADIENT,
    background: '#191327',
    surface: '#241B36',
    surfaceSecondary: '#2E2344',
    text: '#EDE6F2',
    // 🔴 배경 그림 위에 얹히는 글자라 다른 다크 스킨보다 밝다. 인사말 뒤에 호박이 앉는데,
    //    그 자리의 가장 밝은 픽셀(#694237)에서도 2차는 4.81:1 로 AA 를 넘긴다.
    //    3차는 3.38:1 — 바탕 위에서는 7.07:1 이고, 위계를 지키려면 여기가 상한이다.
    //    (dark 의 #806050 을 그대로 가져오면 호박 위에서 1.6:1 로 사라진다.)
    textSecondary: '#C9BCDD',
    textTertiary: '#AA9CC0',
    success: '#7FC244',
    successButton: '#5F9A31',
    successLight: '#1F2F14',
    error: '#E0645A',
    errorLight: '#3A1A18',
    warning: '#E0A23C',
    warningLight: '#3A2A10',
    border: '#3A2E52',
    borderLight: '#2E2344',
    tint: '#E8873A',
    tabIconDefault: '#AA9CC0',
    tabIconSelected: '#E8873A',
    cardShadow: 'rgba(0,0,0,0.28)',
    overlay: 'rgba(8,5,15,0.65)',
    surfaceModal: '#241B36',
    onPrimary: '#191327',
    shadow: '#000000',
    starGold: '#E8C766',
    hintBg: '#3A2E14',
    hintBorder: '#A88A2C',
    hintText: '#FDE68A',
    icons: {
      memorization: '#5DBFA0',
      shuffle: '#B58CE0',
      sound: '#E8855C',
      timing: '#E0B070',
      language: '#5BB5AC',
      chat: '#D97AAA',
    },
    brand: {
      green: '#A8D585',
      greenLight: '#1F3818',
      greenDark: '#C8E8A8',
      googleBlue: '#5A95F5',
      naverGreen: '#5BC080',
    },
    difficulty: {
      beginnerBg: 'rgba(22,163,74,0.2)',
      beginnerText: '#6FD193',
      intermediateBg: 'rgba(37,99,235,0.2)',
      intermediateText: '#7AB0F0',
      advancedBg: 'rgba(220,38,38,0.2)',
      advancedText: '#E89090',
    },
  },
};

/**
 * 완주 상장의 금박 — 이중 괘선 안쪽 선과 도장.
 *
 * 스킨 팔레트에 넣지 않는다: 상장은 공유 이미지라 보는 사람의 테마와 무관하게 늘 같은
 * 종이여야 하고(카드가 Colors.light를 고정 사용하는 것과 같은 이유), 일곱 스킨 전부에
 * 쓰이지 않는 값을 ThemeColors에 얹으면 스킨을 하나 더할 때마다 따라다닌다.
 */
export const CERT_GOLD = '#B08327';

export default Colors;
