import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import { FlatCompat } from '@eslint/eslintrc';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import boundaries from 'eslint-plugin-boundaries';
import tseslint from 'typescript-eslint';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
});

/**
 * Next.js backoffice config.
 * Does not re-register eslint-plugin-import — next/core-web-vitals already provides it.
 * @type {import('eslint').Linter.Config[]}
 */
export default [
  ...compat.extends('next/core-web-vitals'),
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    plugins: {
      boundaries,
    },
    settings: {
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
    files: ['**/*.{ts,tsx}'],
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      'react/react-in-jsx-scope': 'off',
      'boundaries/element-types': [
        'error',
        {
          default: 'allow',
          rules: [
            {
              from: 'backoffice',
              disallow: ['api'],
            },
          ],
        },
      ],
    },
  },
];
