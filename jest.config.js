/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    // 🔴 scripts/_shared/model 은 .ts 와 .mjs 두 벌로 있다(ESM 전용 스크립트 때문에).
    //    preset 기본 순서는 mjs 가 ts 보다 앞이라, transform 대상이 아닌 .mjs 를 집어
    //    'Unexpected token export' 로 죽는다. 모델 일원화(0a9a90f)가 .mjs 를 추가하며
    //    ko-ladder-split 테스트를 조용히 꺼뜨린 자리다 — 확장자 우선순위를 명시한다.
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'json', 'node'],
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/$1',
        '^@shared/(.*)$': '<rootDir>/shared/$1',
        // Deno Edge Function 코드는 상대 import 에 .ts 확장자가 필수다. Jest(node)
        // 모듈 해석은 확장자 없는 형태를 기대하므로, 상대 .ts import 를 무확장자로
        // 매핑해 supabase/functions/* 모듈을 테스트에서 그대로 import 할 수 있게 한다.
        '^(\\.{1,2}/.*)\\.ts$': '$1',
    },
    transform: {
        // jest 전용 tsconfig 사용 (isolatedModules: true). Deno Edge Function 의
        // .ts 확장자 상대 import(TS5097)를 타입체크 단계에서 막지 않게 한다.
        '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: 'tsconfig.jest.json' }],
    },
    transformIgnorePatterns: [
        'node_modules/(?!(expo-sqlite|expo-modules-core|react-native|@react-native|expo)/)',
    ],
};
