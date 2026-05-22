/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testTimeout: 30000,
  passWithNoTests: true,
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.test\\.ts$'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    // Stub the Meilisearch ESM-only package in the Jest CJS environment.
    // Tests that exercise search routes mock the search handler directly.
    '^meilisearch$': '<rootDir>/src/__mocks__/meilisearch.ts',
  },
  coverageThreshold: {
    global: { branches: 95, functions: 95, lines: 95, statements: 95 },
  },
  collectCoverageFrom: ['src/domain/**/*.ts', '!src/domain/**/__tests__/**', '!src/**/*.d.ts'],
}

module.exports = config
