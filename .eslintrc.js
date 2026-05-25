/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  env: {
    es2022: true,
    node: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    project: [
      './tsconfig.json',
      './apps/api/tsconfig.json',
      './apps/web/tsconfig.json',
      './apps/worker/tsconfig.json',
      // tsconfig.eslint.json extends the production tsconfig but includes test files,
      // which the production tsconfig excludes to keep the build artefact clean.
      './packages/domain/tsconfig.eslint.json',
      './packages/shared/tsconfig.json',
      './packages/ui/tsconfig.json',
    ],
    tsconfigRootDir: __dirname,
  },
  plugins: ['@typescript-eslint', 'import'],
  extends: ['airbnb-base', 'airbnb-typescript/base', 'prettier'],
  settings: {
    'import/resolver': {
      typescript: {
        alwaysTryTypes: true,
        project: [
          './tsconfig.json',
          './apps/api/tsconfig.json',
          './apps/web/tsconfig.json',
          './apps/worker/tsconfig.json',
          './packages/domain/tsconfig.eslint.json',
          './packages/shared/tsconfig.json',
          './packages/ui/tsconfig.json',
        ],
      },
    },
  },
  rules: {
    'import/prefer-default-export': 'off',
    'import/no-extraneous-dependencies': [
      'error',
      {
        devDependencies: ['**/*.test.ts', '**/*.spec.ts', '**/jest.config.*', '**/jest.setup.*'],
      },
    ],
    'no-restricted-syntax': [
      'error',
      {
        selector: 'LabeledStatement',
        message: 'Labels are a form of GOTO; use break/continue with loop labels instead.',
      },
      { selector: 'WithStatement', message: '`with` is disallowed in strict mode.' },
    ],
    '@typescript-eslint/consistent-type-imports': [
      'error',
      { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
    ],
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    // Allow `void expr` as a statement — required for Fastify's fire-and-forget
    // app.register() pattern and for explicitly discarding promise return values.
    'no-void': ['error', { allowAsStatement: true }],
  },
  overrides: [
    {
      // Bootstrap / entry-point files that run before the structured logger exists.
      // console.error is the only available output channel at process startup.
      files: ['**/src/config.ts', '**/src/index.ts'],
      rules: { 'no-console': 'off' },
    },
    {
      files: ['**/*.test.ts', '**/*.spec.ts'],
      env: { jest: true },
      rules: {
        '@typescript-eslint/no-non-null-assertion': 'off',
        'import/no-extraneous-dependencies': 'off',
      },
    },
    {
      // The demo Next.js app lives at the repo root (src/**).
      // Its runtime deps (react, next, lucide-react, etc.) are declared in
      // workspace sub-packages and hoisted to the root node_modules, so they
      // are available at build time but won't appear in the root package.json.
      // Disable the extraneous-deps rule for these files only.
      files: ['src/**/*.{ts,tsx}'],
      rules: {
        'import/no-extraneous-dependencies': 'off',
      },
    },
  ],
  ignorePatterns: [
    'node_modules/',
    'dist/',
    '.next/',
    'coverage/',
    '*.config.js',
    '*.config.mjs',
    '.eslintrc.js',
    'commitlint.config.*',
  ],
}
