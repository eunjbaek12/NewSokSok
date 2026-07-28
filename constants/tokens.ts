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
