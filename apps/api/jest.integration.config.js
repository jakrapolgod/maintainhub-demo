/**
 * Jest configuration for integration tests.
 *
 * Integration tests connect to the running development PostgreSQL
 * (started by `pnpm dev:infra`). They use timestamp-scoped test data and
 * clean up after themselves, so they are safe to run alongside the dev DB.
 *
 * Run with:
 *   pnpm --filter @maintainhub/api test:integration
 *
 * Prerequisites:
 *   pnpm dev:infra          ← Docker services must be running
 *   apps/api/.env           ← DATABASE_URL must be set
 */

/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.integration.test.ts'],
  // 60s: covers DB connection, schema setup, and all test assertions
  testTimeout: 60_000,
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
}

module.exports = config
