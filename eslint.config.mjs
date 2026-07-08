import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

const qualityRules = {
  'max-lines': [
    'warn',
    {
      max: 500,
      skipBlankLines: true,
      skipComments: true,
    },
  ],
  'max-lines-per-function': [
    'warn',
    {
      max: 80,
      skipBlankLines: true,
      skipComments: true,
    },
  ],
};

export default [
  {
    ignores: ['.vite/**', 'node_modules/**'],
  },
  {
    files: ['forge.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: {
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
          varsIgnorePattern: '^_',
        },
      ],
      ...qualityRules,
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      'react-hooks': reactHooks,
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
          varsIgnorePattern: '^_',
        },
      ],
      'react-hooks/exhaustive-deps': 'error',
      ...qualityRules,
    },
  },
];
