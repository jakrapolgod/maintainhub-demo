/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  passWithNoTests: true,
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/*.test.ts'],
  moduleNameMapper: {
    // Remap .js imports to the TS source during testing
    '^(\\.{1,2}/.*)\\.js$': '$1',
    // Resolve @maintainhub/domain to its built dist
    '^@maintainhub/domain$': '<rootDir>/../../packages/domain/dist/index.js',
  },
  coverageThreshold: {
    global: { branches: 90, functions: 90, lines: 90, statements: 90 },
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts', '!src/**/*.d.ts'],
}

module.exports = config
