/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Don't fail when no test files exist yet — coverage threshold enforces quality
  // once the first domain entity + test are added.
  passWithNoTests: true,
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/*.test.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  coverageThreshold: {
    global: {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95,
    },
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/index.ts', // root barrel — re-exports only
    '!src/**/index.ts', // sub-barrel re-export files
    '!src/**/*.d.ts',
  ],
}

module.exports = config
