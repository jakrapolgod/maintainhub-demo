/** @type {import("eslint").Linter.Config} */
module.exports = {
  // root: true isolates this config from the workspace-root .eslintrc.js.
  // The root config's parserOptions.project lists backend tsconfigs only;
  // climbing into it would cause "file not in any tsconfig" errors for web files.
  root: true,
  // Storybook config lives in a dot-directory; ESLint would warn about it when
  // lint-staged passes those files explicitly — easier to just ignore them.
  ignorePatterns: ['.storybook/', '.next/', 'node_modules/'],
  extends: ['next/core-web-vitals', 'prettier'],
  rules: {
    'import/prefer-default-export': 'off',
    // next/core-web-vitals handles react-in-jsx-scope and prop-types for React 17+
    'react/react-in-jsx-scope': 'off',
    'react/require-default-props': 'off',
    // App Router projects have no pages/ directory; disable this Next.js rule
    '@next/next/no-html-link-for-pages': 'off',
    // next/image optimisation is a deployment concern, not a lint blocker
    '@next/next/no-img-element': 'off',
  },
}
