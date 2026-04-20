/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/$1',
        '^@shared/(.*)$': '<rootDir>/shared/$1',
    },
    transformIgnorePatterns: [
        'node_modules/(?!(expo-sqlite|expo-modules-core|react-native|@react-native|expo)/)',
    ],
};
