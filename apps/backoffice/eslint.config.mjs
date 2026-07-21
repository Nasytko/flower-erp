import eslintConfig from '@flower/eslint-config/next';

export default [
  ...eslintConfig,
  {
    ignores: ['.next/**', 'next-env.d.ts'],
  },
];
