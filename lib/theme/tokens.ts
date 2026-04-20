/**
 * Design tokens — the single source of truth for spacing, radius, typography
 * and motion. Color palettes live in `lib/theme/colors.ts` (step 10) and
 * `constants/colors.ts` until then.
 *
 * Hex literals in screens/components must go away (step 10 sweep). Prefer
 * `tokens.radius.md`, `tokens.spacing.lg`, etc.
 */
export const tokens = {
  spacing: {
    xxs: 2,
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
  },
  radius: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    pill: 999,
  },
  fontSize: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 20,
    xxl: 24,
    xxxl: 32,
  },
  fontWeight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.4,
    relaxed: 1.6,
  },
  hitSlop: {
    sm: 6,
    md: 10,
    lg: 16,
  },
  duration: {
    fast: 120,
    normal: 220,
    slow: 320,
  },
  elevation: {
    sm: 2,
    md: 6,
    lg: 10,
  },
  // Popup tokens — carried over from constants/popup.ts so step 10 can drop
  // the constants/ folder entirely.
  popup: {
    radius: { standard: 20, contextMenu: 12, toast: 12 },
    maxWidth: { standard: 400, form: 500, contextMenu: 192 },
    maxHeight: { standard: '85%' as const, management: '80%' as const },
    padding: { container: 24 },
    header: {
      standard: { titleSize: 18, closeSize: 24 },
      compact: { titleSize: 15, closeSize: 20 },
    },
    button: {
      standard: { paddingVertical: 13, borderRadius: 10, fontSize: 15 },
      compact: { paddingVertical: 8, borderRadius: 8, fontSize: 14 },
    },
  },
} as const;

export type Tokens = typeof tokens;
