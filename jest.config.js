/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
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
