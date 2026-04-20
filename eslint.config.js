const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'server_dist/*', '.expo/*', '.playwright-cli/*'],
  },
  // Feature boundary enforcement (step 12b).
  // Generic components (components/, lib/) must not depend on feature internals.
  // Features can only cross-import through their public barrel (index).
  {
    files: ['components/**/*.{ts,tsx}', 'lib/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['@/features/*/*'],
            message: 'Generic code must import features only via their barrel: @/features/<name>.',
          },
        ],
      }],
    },
  },
  {
    files: ['features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['@/features/*/*'],
            message: 'Cross-feature imports must go through the target feature barrel: @/features/<name>.',
          },
        ],
      }],
    },
  },
  // Step 10b guard: data/logic layers are already hex-free. Keep them that way —
  // any new `'#RRGGBB'` literal here must instead come from the theme tokens
  // (`colors.X` from @/features/theme, or `tokens.X` from @/lib/theme/tokens).
  // UI layers (app/**, components/**, features/*/screen.tsx, features/*/components/**)
  // are still being swept and are intentionally excluded.
  {
    files: [
      'features/auth/**/*.{ts,tsx}',
      'features/settings/**/*.{ts,tsx}',
      'features/sync/**/*.{ts,tsx}',
      'features/vocab/**/*.{ts,tsx}',
      'features/theme/**/*.{ts,tsx}',
      'features/locale/**/*.{ts,tsx}',
      'features/onboarding/store.ts',
      'features/onboarding/index.ts',
      'server/**/*.{ts,tsx}',
      'shared/**/*.{ts,tsx}',
      'lib/api/**/*.{ts,tsx}',
      'lib/storage/**/*.{ts,tsx}',
      'lib/theme/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-syntax': ['error', {
        selector: "Literal[value=/^#[0-9a-fA-F]{3,8}$/]",
        message: 'Hex color literals are forbidden here. Use theme tokens (colors.X) or constants. See docs/refactor-plan handoff Step 10b.',
      }],
    },
  },
]);
