import eslintConfig from '@flower/eslint-config';

export default [
  ...eslintConfig,
  {
    ignores: ['dist/**', 'prisma/migrations/**'],
  },
];
