/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies are forbidden across the monorepo.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'contracts-is-leaf',
      severity: 'error',
      from: { path: '^packages/contracts' },
      to: { path: '^apps|^packages/(api-client|ui|config|permissions)' },
    },
    {
      name: 'backoffice-must-not-import-api-src',
      severity: 'error',
      from: { path: '^apps/backoffice' },
      to: { path: '^apps/api' },
    },
    {
      name: 'domain-must-not-import-prisma',
      severity: 'error',
      from: { path: 'apps/api/src/modules/.*/domain' },
      to: { path: '(@prisma/client|infrastructure/prisma)' },
    },
    {
      name: 'application-must-not-import-prisma',
      severity: 'error',
      from: { path: 'apps/api/src/modules/.*/application' },
      to: { path: '(@prisma/client|infrastructure/prisma)' },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    exclude: {
      path: '(^|/)(test|dist|\\.next)(/|$)|\\.test\\.ts$|\\.integration\\.test\\.ts$|\\.e2e\\.test\\.ts$',
    },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports', 'main'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
};
