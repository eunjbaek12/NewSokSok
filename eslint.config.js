const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

const HEX_GUARD = {
  selector: "Literal[value=/^#[0-9a-fA-F]{3,8}$/]",
  message: 'Hex color literals are forbidden. Use theme tokens (colors.X from @/features/theme) or system tokens. See docs/refactor-plan handoff Step 10b.',
};

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
  // Step 10b guard: hex literals forbidden across the entire UI + data layer.
  // Theme palette and SVG illustrations are exempt — see exception block below.
  {
    files: [
      'app/**/*.{ts,tsx}',
      'components/**/*.{ts,tsx}',
      'features/**/*.{ts,tsx}',
      'hooks/**/*.{ts,tsx}',
      'lib/**/*.{ts,tsx}',
      'server/**/*.{ts,tsx}',
      'shared/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-syntax': ['error', HEX_GUARD],
    },
  },
  // Exceptions: theme palette is the single source of hex truth; SVG character
  // illustrations carry their own static art colors (intentionally theme-agnostic).
  {
    files: [
      'constants/colors.ts',
      'lib/theme/**/*.{ts,tsx}',
      'components/CharacterSvg.tsx',
      'components/ErrorFallback.tsx',
      'features/onboarding/screen.tsx',
      'features/onboarding/components/AvocadoCharacter.tsx',
      'features/onboarding/components/OnboardingDots.tsx',
      'features/onboarding/components/demos/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
]);
