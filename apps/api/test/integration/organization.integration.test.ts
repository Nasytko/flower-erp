import assert from 'node:assert/strict';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { OrganizationModule } from '../../src/modules/organization/organization.module.js';
import { InfrastructureModule } from '../../src/infrastructure/infrastructure.module.js';
import { OrganizationUseCases } from '../../src/modules/organization/application/organization.use-cases.js';
import { requestContextStorage } from '../../src/infrastructure/context/request-context.js';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service.js';

const DATABASE_URL = process.env.DATABASE_URL;
const runIntegration = Boolean(DATABASE_URL) && process.env.SKIP_INTEGRATION !== '1';

async function withApp<T>(fn: (useCases: OrganizationUseCases, prisma: PrismaService) => Promise<T>) {
  const moduleRef = await Test.createTestingModule({
    imports: [InfrastructureModule, OrganizationModule],
  }).compile();

  const useCases = moduleRef.get(OrganizationUseCases);
  const prisma = moduleRef.get(PrismaService);
  await prisma.$connect();

  try {
    return await requestContextStorage.run(
      { requestId: 'test-request', actorId: null, organizationId: null },
      () => fn(useCases, prisma),
    );
  } finally {
    await prisma.$disconnect();
    await moduleRef.close();
  }
}

test('create organization persists and audits', { skip: !runIntegration }, async () => {
  await withApp(async (useCases, prisma) => {
    const org = await useCases.createOrganization({ name: `Org ${Date.now()}` });
    assert.equal(org.status, 'ACTIVE');
    const audits = await prisma.auditLog.findMany({
      where: { organizationId: org.id, action: 'organization.created' },
    });
    assert.equal(audits.length, 1);
  });
});

test('store code unique per org; same code allowed in other org', { skip: !runIntegration }, async () => {
  await withApp(async (useCases) => {
    const orgA = await useCases.createOrganization({ name: `A ${Date.now()}` });
    const orgB = await useCases.createOrganization({ name: `B ${Date.now()}` });
    const code = `C${Date.now().toString().slice(-6)}`;

    await useCases.createStoreWithDefaultWarehouse({
      organizationId: orgA.id,
      name: 'Store A',
      code,
    });

    await assert.rejects(() =>
      useCases.createStoreWithDefaultWarehouse({
        organizationId: orgA.id,
        name: 'Store A2',
        code,
      }),
    );

    const { store } = await useCases.createStoreWithDefaultWarehouse({
      organizationId: orgB.id,
      name: 'Store B',
      code,
    });
    assert.equal(store.code, code.toUpperCase());
  });
});

test('create store creates default warehouse and dual audit in one tx', { skip: !runIntegration }, async () => {
  await withApp(async (useCases, prisma) => {
    const org = await useCases.createOrganization({ name: `StoreOrg ${Date.now()}` });
    const { store, warehouse } = await useCases.createStoreWithDefaultWarehouse({
      organizationId: org.id,
      name: 'Main Salon',
      code: `S${Date.now().toString().slice(-5)}`,
    });

    assert.equal(warehouse.isDefault, true);
    assert.equal(warehouse.storeId, store.id);

    const audits = await prisma.auditLog.findMany({
      where: { storeId: store.id },
      orderBy: { createdAt: 'asc' },
    });
    assert.equal(audits.length, 2);
    assert.deepEqual(
      audits.map((a) => a.action).sort(),
      ['store.created', 'warehouse.created'].sort(),
    );
  });
});

test('tenancy: cannot get store of another organization', { skip: !runIntegration }, async () => {
  await withApp(async (useCases) => {
    const orgA = await useCases.createOrganization({ name: `TA ${Date.now()}` });
    const orgB = await useCases.createOrganization({ name: `TB ${Date.now()}` });
    const { store } = await useCases.createStoreWithDefaultWarehouse({
      organizationId: orgA.id,
      name: 'Private',
      code: `P${Date.now().toString().slice(-5)}`,
    });

    await assert.rejects(() => useCases.getStore(orgB.id, store.id));
  });
});

test('cannot create second default warehouse (DB constraint)', { skip: !runIntegration }, async () => {
  await withApp(async (useCases, prisma) => {
    const org = await useCases.createOrganization({ name: `DefOrg ${Date.now()}` });
    const { store } = await useCases.createStoreWithDefaultWarehouse({
      organizationId: org.id,
      name: 'One Default',
      code: `D${Date.now().toString().slice(-5)}`,
    });

    await assert.rejects(() =>
      prisma.warehouse.create({
        data: {
          id: crypto.randomUUID(),
          organizationId: org.id,
          storeId: store.id,
          name: 'Second default',
          code: 'MAIN2',
          isDefault: true,
        },
      }),
    );
  });
});

test('archive does not delete rows', { skip: !runIntegration }, async () => {
  await withApp(async (useCases, prisma) => {
    const org = await useCases.createOrganization({ name: `Arch ${Date.now()}` });
    const { store } = await useCases.createStoreWithDefaultWarehouse({
      organizationId: org.id,
      name: 'ArchStore',
      code: `A${Date.now().toString().slice(-5)}`,
    });

    await useCases.archiveStore({ organizationId: org.id, storeId: store.id });
    await useCases.archiveOrganization({ organizationId: org.id });

    const storeRow = await prisma.store.findUnique({ where: { id: store.id } });
    const orgRow = await prisma.organization.findUnique({ where: { id: org.id } });
    assert.equal(storeRow?.status, 'ARCHIVED');
    assert.equal(orgRow?.status, 'ARCHIVED');
  });
});

test('audit log table exists (no update/delete API in app)', { skip: !runIntegration }, async () => {
  const prisma = new PrismaClient();
  await prisma.$connect();
  const count = await prisma.auditLog.count();
  assert.ok(count >= 0);
  await prisma.$disconnect();
});
