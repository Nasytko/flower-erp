/**
 * Nest module-graph regression tests.
 *
 * - DI compile tests always run (no live DB): catch UnknownDependenciesException.
 * - Full init + health HTTP tests run when DATABASE_URL is set and reachable.
 */
import '../helpers/test-env.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { Test } from '@nestjs/testing';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { InventoryModule } from '../../src/modules/inventory/inventory.module.js';
import { InfrastructureModule } from '../../src/infrastructure/infrastructure.module.js';
import { WriteOffUseCases } from '../../src/modules/inventory/application/write-off.use-cases.js';
import { ItemUseCases } from '../../src/modules/master-data/application/item.use-cases.js';
import { OrganizationUseCases } from '../../src/modules/organization/application/organization.use-cases.js';
import { UNIT_OF_WORK } from '../../src/infrastructure/persistence/unit-of-work.port.js';
import { CLOCK_PORT } from '@flower/shared-kernel';
import { AUDIT_PORT } from '../../src/infrastructure/audit/audit.port.js';
import { INVENTORY_WRITE_OFF_PORT } from '../../src/modules/inventory/application/ports/inventory-write-off.port.js';
import { createApp } from '../helpers/app-test.helper.js';

/** Placeholder URL for DI compile only — never used for a real connection in these tests. */
const DI_PLACEHOLDER_DATABASE_URL =
  'postgresql://di_bootstrap:di_bootstrap@127.0.0.1:5432/flower_erp_di?schema=public';

async function withDiEnv<T>(fn: () => Promise<T>): Promise<T> {
  const previous = process.env.DATABASE_URL;
  if (!previous) {
    process.env.DATABASE_URL = DI_PLACEHOLDER_DATABASE_URL;
  }
  try {
    return await fn();
  } finally {
    if (!previous) {
      delete process.env.DATABASE_URL;
    }
  }
}

async function canReachDatabase(): Promise<boolean> {
  const url = process.env.DATABASE_URL;
  if (!url || process.env.SKIP_BOOTSTRAP === '1' || url === DI_PLACEHOLDER_DATABASE_URL) {
    return false;
  }
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    try {
      await prisma.$queryRaw`SELECT 1`;
      return true;
    } finally {
      await prisma.$disconnect().catch(() => undefined);
    }
  } catch {
    return false;
  }
}

test('AppModule DI graph compiles and resolves WriteOffUseCases', async () => {
  // compile() instantiates providers and fails on UnknownDependenciesException.
  // onModuleInit (Prisma $connect) is NOT run until init() — so no live DB required.
  await withDiEnv(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    try {
      const writeOffs = moduleRef.get(WriteOffUseCases, { strict: false });
      const items = moduleRef.get(ItemUseCases, { strict: false });
      const orgs = moduleRef.get(OrganizationUseCases, { strict: false });

      assert.ok(writeOffs instanceof WriteOffUseCases);
      assert.ok(items instanceof ItemUseCases);
      assert.ok(orgs instanceof OrganizationUseCases);
      assert.equal(writeOffs.constructor, WriteOffUseCases);
      assert.equal(items.constructor, ItemUseCases);

      assert.ok(moduleRef.get(UNIT_OF_WORK, { strict: false }));
      assert.ok(moduleRef.get(CLOCK_PORT, { strict: false }));
      assert.ok(moduleRef.get(AUDIT_PORT, { strict: false }));
      assert.ok(moduleRef.get(INVENTORY_WRITE_OFF_PORT, { strict: false }));
    } finally {
      await moduleRef.close();
    }
  });
});

test('InventoryModule compiles with MasterData ItemUseCases export', async () => {
  await withDiEnv(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [InfrastructureModule, InventoryModule],
    }).compile();

    try {
      const writeOffs = moduleRef.get(WriteOffUseCases);
      const items = moduleRef.get(ItemUseCases, { strict: false });
      assert.ok(writeOffs instanceof WriteOffUseCases);
      assert.ok(items instanceof ItemUseCases);
    } finally {
      await moduleRef.close();
    }
  });
});

test('AppModule application context initializes (full DI + Prisma)', async (t) => {
  if (!(await canReachDatabase())) {
    t.skip('DATABASE_URL unset or database unreachable');
    return;
  }
  let ctx: INestApplicationContext | undefined;
  try {
    ctx = await NestFactory.createApplicationContext(AppModule, {
      abortOnError: false,
      logger: false,
    });
    await ctx.init();
    assert.ok(ctx.get(WriteOffUseCases, { strict: false }) instanceof WriteOffUseCases);
  } finally {
    await ctx?.close();
  }
});

test('HTTP bootstrap serves public health live endpoint', async (t) => {
  if (!(await canReachDatabase())) {
    t.skip('DATABASE_URL unset or database unreachable');
    return;
  }
  const app = await createApp();
  try {
    const res = await request(app.getHttpServer()).get('/api/v1/health/live').expect(200);
    assert.equal(res.body.status, 'ok');
    assert.equal(res.body.service, 'flower-erp-api');
  } finally {
    await app.close();
  }
});
