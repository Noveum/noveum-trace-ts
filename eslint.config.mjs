import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import prettier from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'], // Only source files require TypeScript project config
    languageOptions: {
      parser: tsparser,
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        project: './tsconfig.json',
      },
      globals: {
        ...globals.node,
        ...globals.browser,
        NodeJS: 'readonly',
        RequestInit: 'readonly',
        __SDK_VERSION__: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      prettier: prettier,
    },
    rules: {
      ...prettierConfig.rules,
      
      // TypeScript specific rules
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'off', // Relaxed - allow any types
      '@typescript-eslint/no-non-null-assertion': 'off', // Relaxed - allow ! operator
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/prefer-optional-chain': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-floating-promises': 'error', // Re-enabled for async safety
      '@typescript-eslint/await-thenable': 'error', // Re-enabled for async safety
      
      // General rules
      'no-console': 'off', // Relaxed - allow console statements
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
      'prefer-template': 'error',
      'no-unused-vars': 'off', // Use TypeScript version instead
      'no-useless-catch': 'off', // Relaxed - allow simple catch blocks
      
      // Prettier integration
      'prettier/prettier': 'error',
    },
  },
  {
    // Separate configuration for test files and examples that don't require project TypeScript config
    files: ['test/**/*.{js,ts,tsx}', 'tests/**/*.{js,ts,tsx}', 'examples/**/*.{js,ts,tsx}', '**/*.test.ts', '**/*.spec.ts'],
    languageOptions: {
      parser: tsparser,
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.browser,
        NodeJS: 'readonly',
        RequestInit: 'readonly',
        __SDK_VERSION__: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      prettier: prettier,
    },
    rules: {
      ...prettierConfig.rules,
      
      // TypeScript specific rules (more relaxed for tests)
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/prefer-optional-chain': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-floating-promises': 'off', // More relaxed for tests
      '@typescript-eslint/await-thenable': 'off', // More relaxed for tests
      
      // General rules
      'no-console': 'off',
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
      'prefer-template': 'error',
      'no-unused-vars': 'off',
      'no-useless-catch': 'off',
      
      // Prettier integration
      'prettier/prettier': 'error',
    },
  },
  {
    ignores: [
      'dist/',
      'node_modules/',
      '*.js',
      '*.mjs',
      'coverage/',
      '.nyc_output/',
    ],
  },
]; 