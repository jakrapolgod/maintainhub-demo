/** @type {import('lint-staged').Config} */
module.exports = {
  '*.{ts,tsx}': (files) => {
    // Exclude files that ESLint cannot type-check (not in any tsconfig).
    const lintable = files.filter((f) => !f.endsWith('prisma/seed.ts'))
    return lintable.length
      ? [
          `eslint --fix --max-warnings 0 ${lintable.join(' ')}`,
          `prettier --write ${files.join(' ')}`,
        ]
      : [`prettier --write ${files.join(' ')}`]
  },
  '*.{js,mjs,cjs}': ['prettier --write'],
  '*.{json,md,yaml,yml}': ['prettier --write'],
}
