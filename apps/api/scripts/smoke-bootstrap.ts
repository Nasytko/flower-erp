/**
 * Standalone production bootstrap smoke (exit 0 only after full Nest init).
 * Usage: pnpm --filter @flower/api smoke:bootstrap
 */
import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../src/app.module.js';
import { WriteOffUseCases } from '../src/modules/inventory/application/write-off.use-cases.js';
import { ItemUseCases } from '../src/modules/master-data/application/item.use-cases.js';
import { UNIT_OF_WORK } from '../src/infrastructure/persistence/unit-of-work.port.js';
import { CLOCK_PORT } from '@flower/shared-kernel';
import { AUDIT_PORT } from '../src/infrastructure/audit/audit.port.js';
import { INVENTORY_WRITE_OFF_PORT } from '../src/modules/inventory/application/ports/inventory-write-off.port.js';

const here = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.resolve(here, '../../../.env') });

process.env.NODE_ENV ??= 'production';
// Local smoke may lack JWT in root .env; production containers always inject secrets.
process.env.JWT_ACCESS_SECRET ??= 'smoke-access-secret-minimum-32-characters-xx';
process.env.JWT_REFRESH_SECRET ??= 'smoke-refresh-secret-minimum-32-characters-x';

function requireEnv(name: string): void {
  const value = process.env[name];
  if (!value || value.startsWith('CHANGE_ME')) {
    console.error(`SMOKE FAILED: missing or placeholder env ${name}`);
    process.exit(1);
  }
}

requireEnv('DATABASE_URL');
requireEnv('JWT_ACCESS_SECRET');
requireEnv('JWT_REFRESH_SECRET');

async function main(): Promise<void> {
  const nestLogger = new Logger('SmokeBootstrap');
  nestLogger.log('Creating AppModule application context...');

  const ctx = await NestFactory.createApplicationContext(AppModule, {
    abortOnError: false,
    logger: nestLogger,
  });

  try {
    await ctx.init();
    const writeOffs = ctx.get(WriteOffUseCases, { strict: false });
    const items = ctx.get(ItemUseCases, { strict: false });
    if (!(writeOffs instanceof WriteOffUseCases)) {
      throw new Error('WriteOffUseCases did not resolve');
    }
    if (!(items instanceof ItemUseCases)) {
      throw new Error('ItemUseCases did not resolve');
    }
    ctx.get(UNIT_OF_WORK, { strict: false });
    ctx.get(CLOCK_PORT, { strict: false });
    ctx.get(AUDIT_PORT, { strict: false });
    ctx.get(INVENTORY_WRITE_OFF_PORT, { strict: false });
    nestLogger.log('AppModule bootstrap OK (DI + Prisma)');
  } finally {
    await ctx.close();
  }
}

main().catch((err: unknown) => {
  console.error('SMOKE BOOTSTRAP FAILED');
  console.error(err);
  if (err && typeof err === 'object' && 'stack' in err) {
    console.error((err as { stack?: string }).stack);
  }
  process.exit(1);
});
