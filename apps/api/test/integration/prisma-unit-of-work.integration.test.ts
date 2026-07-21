import assert from 'node:assert/strict';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import { PrismaUnitOfWork } from '../../src/infrastructure/persistence/prisma-unit-of-work.js';
import {
  NestedTransactionError,
  getActivePrismaTx,
  resolvePrismaClient,
} from '../../src/infrastructure/persistence/prisma-transaction-context.js';

const DATABASE_URL = process.env.DATABASE_URL;
const runIntegration = Boolean(DATABASE_URL) && process.env.SKIP_INTEGRATION !== '1';

test('nested transaction throws NestedTransactionError', { skip: !runIntegration }, async () => {
  const prisma = new PrismaClient();
  const uow = new PrismaUnitOfWork(prisma as never);
  await assert.rejects(
    () =>
      uow.runInTransaction(async () =>
        uow.runInTransaction(async () => 'nope'),
      ),
    NestedTransactionError,
  );
  await prisma.$disconnect();
});

test('commit persists rows created inside UoW', { skip: !runIntegration }, async () => {
  const prisma = new PrismaClient();
  const uow = new PrismaUnitOfWork(prisma as never);
  const id = crypto.randomUUID();

  await uow.runInTransaction(async () => {
    const client = resolvePrismaClient(prisma);
    assert.ok(getActivePrismaTx());
    await client.organization.create({
      data: { id, name: `UoW Commit ${id.slice(0, 8)}`, status: 'ACTIVE' },
    });
  });

  const found = await prisma.organization.findUnique({ where: { id } });
  assert.ok(found);
  await prisma.organization.delete({ where: { id } });
  await prisma.$disconnect();
});

test('rollback discards partial work on error', { skip: !runIntegration }, async () => {
  const prisma = new PrismaClient();
  const uow = new PrismaUnitOfWork(prisma as never);
  const id = crypto.randomUUID();

  await assert.rejects(() =>
    uow.runInTransaction(async () => {
      const client = resolvePrismaClient(prisma);
      await client.organization.create({
        data: { id, name: `UoW Rollback ${id.slice(0, 8)}`, status: 'ACTIVE' },
      });
      throw new Error('boom');
    }),
  );

  const found = await prisma.organization.findUnique({ where: { id } });
  assert.equal(found, null);
  await prisma.$disconnect();
});

test('repository helper uses transaction client inside UoW', { skip: !runIntegration }, async () => {
  const prisma = new PrismaClient();
  const uow = new PrismaUnitOfWork(prisma as never);

  await uow.runInTransaction(async () => {
    const tx = getActivePrismaTx();
    assert.ok(tx);
    const resolved = resolvePrismaClient(prisma);
    assert.equal(resolved, tx);
  });

  assert.equal(getActivePrismaTx(), undefined);
  await prisma.$disconnect();
});
