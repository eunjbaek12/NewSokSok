// Design tokens — single source of truth for spatial values.
// Use semantic names at call sites, not raw numbers.

// 스케일은 실측에서 정했다 — 앱이 실제로 쓰던 값 중 상위 여덟 단이고 전체의 약 90%를
// 덮는다. 특히 smd(10)와 pillSm(20)은 각 32곳·24곳에서 쓰이고 있었는데 토큰에 없어서
// 원시 숫자로 남아 있던 값이다. 근거와 용도는 DESIGN.md §6.
export const Radius = {
  xs: 4,     // micro: tags, progress bars, dots
  sm: 8,     // segmented controls, small controls
  smd: 10,   // context menus, small buttons
  md: 12,    // buttons, inputs, standard cards
  lg: 16,    // panels, plan cards, search bars
  pillSm: 20, // filter chips (알약이지만 높이가 낮아 999면 과하다)
  xl: 24,    // bottom sheets, dialogs
  pill: 999, // fully rounded (avatars, toggle pills)
} as const;

export type RadiusKey = keyof typeof Radius;

// 글자 크기 — 반경과 같은 방법으로 정했다. 앱의 fontSize 선언 658개에 서로 다른 값이
// 29개였고, 아래 아홉 단이 그중 86%를 덮는다. 남은 값 대부분은 소수점 여섯 종
// (12.5·11.5·13.5·15.5·14.5·10.5, 35곳)인데 "12는 작고 13은 큰데" 하며 눈으로 맞춘
// 값이라 다음 화면에서 재현되지 않는다 — 통일성을 깨는 것은 이쪽이다.
// 근거와 용도는 DESIGN.md §9.
export const FontSize = {
  caption: 11,  // 배지 · 보조 안내
  label: 12,    // 라벨 · 메타
  small: 13,    // 부가 설명 · 링크
  body: 14,     // 본문 기본 · 목록 행 (최다)
  bodyLg: 15,   // 강조 본문 · 부차 버튼
  action: 16,   // 주 버튼 · 큰 수치
  titleSm: 17,  // 워크플로 모달 헤더 전용(§1.3) — 새 화면은 title 을 쓴다
  title: 18,    // 화면 · 모달 제목
  titleLg: 20,  // 시트 제목
} as const;

// 두께는 **크기가 아니라 역할**에 묶는다. 조합을 열어 두면 한 화면에 13/400·13/500·
// 13/600 이 섞여 무엇이 강조인지 사라진다 — 실제로 13pt 는 세 두께로 다 쓰이고 있다.
export const FontWeight = {
  regular: 'Pretendard_400Regular',   // 읽는 문장 — 설명 · 본문
  medium: 'Pretendard_500Medium',     // 라벨 · 링크 · 부차 버튼
  semibold: 'Pretendard_600SemiBold', // 버튼 · 수치 · 강조
  bold: 'Pretendard_700Bold',         // 제목에만
} as const;

export type FontSizeKey = keyof typeof FontSize;
export type FontWeightKey = keyof typeof FontWeight;
