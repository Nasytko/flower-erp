import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import boundaries from 'eslint-plugin-boundaries';
import importPlugin from 'eslint-plugin-import';
import tseslint from 'typescript-eslint';

/** @type {import('eslint').Linter.Config[]} */
export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    plugins: {
      import: importPlugin,
      boundaries,
    },
    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: true,
        },
        node: true,
      },
      'boundaries/elements': [
        { type: 'contracts', pattern: 'packages/contracts/*' },
        { type: 'shared-kernel', pattern: 'packages/shared-kernel/*' },
        { type: 'permissions', pattern: 'packages/permissions/*' },
        { type: 'config', pattern: 'packages/config/*' },
        { type: 'api-client', pattern: 'packages/api-client/*' },
        { type: 'ui', pattern: 'packages/ui/*' },
        { type: 'api', pattern: 'apps/api/*' },
        { type: 'backoffice', pattern: 'apps/backoffice/*' },
      ],
      'boundaries/include': ['apps/**/*', 'packages/**/*'],
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      'import/no-cycle': ['error', { maxDepth: 20 }],
      'import/no-duplicates': 'error',
      'boundaries/element-types': [
        'error',
        {
          default: 'allow',
          rules: [
            {
              from: 'contracts',
              disallow: ['api', 'backoffice', 'api-client', 'ui', 'config', 'permissions'],
            },
            {
              from: 'shared-kernel',
              disallow: ['api', 'backoffice', 'api-client', 'ui', 'config', 'permissions', 'contracts'],
            },
            {
              from: 'permissions',
              disallow: ['api', 'backoffice', 'api-client', 'ui', 'config'],
            },
            {
              from: 'config',
              disallow: ['api', 'backoffice', 'api-client', 'ui'],
            },
            {
              from: 'api-client',
              disallow: ['api', 'backoffice', 'ui'],
            },
            {
              from: 'ui',
              disallow: ['api', 'backoffice', 'api-client', 'config', 'permissions'],
            },
            {
              from: 'backoffice',
              disallow: ['api'],
            },
          ],
        },
      ],
    },
  },
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/.turbo/**',
    ],
  },
];
