// Design tokens — single source of truth for spatial values.
// Use semantic names at call sites, not raw numbers.

export const Radius = {
  xs: 4,    // micro: tags, progress bars, dots
  sm: 8,    // chips, small controls, context menu rows
  md: 12,   // buttons, inputs, standard cards
  lg: 16,   // panels, plan cards, search bars
  xl: 24,   // bottom sheets, dialogs
  pill: 999, // fully rounded (avatars, toggle pills)
} as const;

export type RadiusKey = keyof typeof Radius;
