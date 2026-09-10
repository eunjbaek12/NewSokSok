const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

const HEX_GUARD = {
  selector: "Literal[value=/^#[0-9a-fA-F]{3,8}$/]",
  message: 'Hex color literals are forbidden. Use theme tokens (colors.X from @/features/theme) or system tokens. See docs/refactor-plan/archive/step-10b-handoff.md.',
};

// HEX_GUARD 가 막지 못한 구멍. `#RRGGBB` 만 보므로 `rgba(42, 30, 15, 0.95)` 는 그대로 통과했고,
// 그 값이 탭바 배경으로 여섯 스킨 동안 살아 있었다 — 다크 스킨의 **갈색** 밤이라, 할로윈
// (보랏빛 밤)이 들어오자 탭바만 갈색으로 남았다. 밝은 스킨끼리는 크림색 하나로 얼추 맞아
// 아무도 못 봤다.
//
// 🔑 회색축(R=G=B)은 통과시킨다. 그림자·오버레이·실선은 스킨과 무관하게 옳은 값이고,
//    저장소에 46 건 있다. 유채색만 막으면 위 결함의 세 건만 걸린다(실측).
const RGBA_GUARD = {
  selector: String.raw`Literal[value=/^rgba?\((?!\s*(\d+)\s*,\s*\1\s*,\s*\1\s*[,)])/]`,
  message: 'Chromatic rgb()/rgba() literals are forbidden — they do not follow the skin. Use colors.X (add an alpha suffix if needed: colors.surface + \'F2\'). Greyscale rgba (shadows, overlays, hairlines) is allowed.',
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
      'no-restricted-syntax': ['error', HEX_GUARD, RGBA_GUARD],
    },
  },
  // Exceptions: theme palette is the single source of hex truth; SVG character
  // illustrations carry their own static art colors (intentionally theme-agnostic).
  {
    files: [
      'constants/colors.ts',
      'lib/theme/**/*.{ts,tsx}',
      'components/CharacterSvg.tsx',
      'components/CharacterAccessory.tsx',
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
