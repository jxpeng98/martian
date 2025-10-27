// ESM flat config for ESLint 9
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  // 1) Ignore directories/files (including this file)
  {
    ignores: [
      'node_modules/**',
      'build/**',
      'eslint.config.js'
    ],
  },

  // 2) JS files: use only JS recommended rules (won't trigger TS rules)
  {
    files: ['**/*.{js,mjs,cjs}'],
    ...js.configs.recommended,
  },

  // 3) TS files: enable rules with type information
  {
    files: ['src/**/*.ts', 'test/**/*.ts', 'scripts/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: new URL('.', import.meta.url).pathname,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    // Recommended "type-checked" rule sets
    rules: {
      ...tseslint.configs.recommendedTypeChecked.rules,
      ...tseslint.configs.stylisticTypeChecked.rules,
      // '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];