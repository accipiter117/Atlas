// Lint for real bugs, not taste: names that do not exist, unused leftovers,
// unreachable code. The check runs at 0 warnings, so every rule here must be
// one worth fixing every time.

import js from '@eslint/js';
import globals from 'globals';

const shared = {
  ...js.configs.recommended.rules,
  'no-unused-vars': ['error', { args: 'none', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
  'no-empty': ['error', { allowEmptyCatch: true }],
  eqeqeq: ['error', 'always'],
};

export default [
  // Vendored code from other Atlas-owner projects is kept unchanged so it can be refreshed (src/battles/*/sim/vendor).
  { ignores: ['node_modules/**', 'test-results/**', 'playwright-report/**', 'src/battles/*/sim/vendor/**'] },
  {
    files: ['src/**/*.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.browser } },
    rules: shared,
  },
  {
    // The save codec may fall back to Node's zlib, so it can see `process`.
    files: ['src/save/codec.js'],
    languageOptions: { globals: { ...globals.browser, process: 'readonly' } },
  },
  {
    // Node tooling and tests. Browser globals too, because Playwright callbacks run in the page.
    files: ['tools/**/*.mjs', 'test/**/*.js', '*.config.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.node, ...globals.browser } },
    rules: shared,
  },
];
