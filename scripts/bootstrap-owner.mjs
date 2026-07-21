#!/usr/bin/env node
/**
 * Bootstrap first organization owner — see docs/development/owner-bootstrap.md
 */
import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadDotenv({ path: path.join(root, '.env') });

process.env.JWT_ACCESS_SECRET ??= 'local-dev-access-secret-min-32-characters';
process.env.JWT_REFRESH_SECRET ??= 'local-dev-refresh-secret-min-32-characters';

const { Test } = await import('@nestjs/testing');
const { InfrastructureModule } = await import('../apps/api/src/infrastructure/infrastructure.module.ts');
const { OrganizationModule } = await import('../apps/api/src/modules/organization/organization.module.ts');
const { MasterDataModule } = await import('../apps/api/src/modules/master-data/master-data.module.ts');
const { IdentityModule } = await import('../apps/api/src/modules/identity/identity.module.ts');
const { BootstrapOwnerUseCases } = await import(
  '../apps/api/src/modules/identity/application/bootstrap-owner.use-cases.ts'
);
const { PrismaService } = await import('../apps/api/src/infrastructure/prisma/prisma.service.ts');

async function prompt(question, envKey) {
  if (process.env[envKey]) return process.env[envKey];
  const rl = readline.createInterface({ input, output });
  const answer = await rl.question(question);
  await rl.close();
  return answer.trim();
}

async function main() {
  if (process.env.ALLOW_OWNER_BOOTSTRAP !== 'true') {
    console.error('Set ALLOW_OWNER_BOOTSTRAP=true to run owner bootstrap.');
    process.exit(1);
  }

  const login = await prompt('Owner login: ', 'BOOTSTRAP_OWNER_LOGIN');
  const password = await prompt('Owner password (min 10 chars): ', 'BOOTSTRAP_OWNER_PASSWORD');
  const displayName = (process.env.BOOTSTRAP_OWNER_DISPLAY_NAME ?? 'Director').trim();
  const organizationName = process.env.BOOTSTRAP_ORGANIZATION_NAME ?? 'Flower ERP';
  const organizationId = process.env.BOOTSTRAP_ORGANIZATION_ID;
  const storeName = process.env.BOOTSTRAP_STORE_NAME ?? 'Main Store';
  const storeCode = process.env.BOOTSTRAP_STORE_CODE ?? 'MAIN';

  const moduleRef = await Test.createTestingModule({
    imports: [InfrastructureModule, OrganizationModule, MasterDataModule, IdentityModule],
  }).compile();

  const prisma = moduleRef.get(PrismaService);
  await prisma.$connect();

  const bootstrap = moduleRef.get(BootstrapOwnerUseCases);
  const result = await bootstrap.bootstrapOwner({
    login,
    password,
    displayName,
    organizationName: organizationId ? undefined : organizationName,
    organizationId,
    storeName,
    storeCode,
  });

  console.log('Bootstrap completed.');
  console.log(JSON.stringify({ ...result, password: '[redacted]' }, null, 2));
  await prisma.$disconnect();
  await moduleRef.close();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
