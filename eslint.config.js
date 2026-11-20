import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', '**/node_modules/**', 'examples/*/dist/**', 'docs/media/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'examples/*/src/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  {
    // Node scripts that also hand functions to the page they drive.
    files: ['scripts/**/*.mjs', '*.config.{js,ts}', 'examples/*/*.config.ts'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
);
