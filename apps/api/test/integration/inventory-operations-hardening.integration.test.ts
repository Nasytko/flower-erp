import '../helpers/test-env.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AUDIT_PORT, type AuditPort } from '../../src/infrastructure/audit/audit.port.js';
import { InfrastructureModule } from '../../src/infrastructure/infrastructure.module.js';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service.js';
import { InventoryCountUseCases } from '../../src/modules/inventory/application/inventory-count.use-cases.js';
import { InventoryQueryUseCases } from '../../src/modules/inventory/application/inventory-query.use-cases.js';
import { WriteOffUseCases } from '../../src/modules/inventory/application/write-off.use-cases.js';
import { MasterDataModule } from '../../src/modules/master-data/master-data.module.js';
import { OrganizationUseCases } from '../../src/modules/organization/application/organization.use-cases.js';
import { OrganizationModule } from '../../src/modules/organization/organization.module.js';
import { SupplyModule } from '../../src/modules/supply/supply.module.js';
import { TransferUseCases } from '../../src/modules/transfers/application/transfer.use-cases.js';
import { TransfersModule } from '../../src/modules/transfers/transfers.module.js';
import { bootstrapDirector } from '../helpers/auth-test.helper.js';
import {
  bootInventoryOps,
  receiveStock,
  runIntegration,
  seedFlowerItem,
  teardown,
} from './helpers/inventory-ops-test.helper.js';

test('write-off FIFO allocation and duplicate idempotency key replay', { skip: !runIntegration }, async () => {
  const auth = await bootstrapDirector();
  const moduleRef = await bootInventoryOps();
  const writeOffs = moduleRef.get(WriteOffUseCases);
  const inventory = moduleRef.get(InventoryQueryUseCases);
  const { item, supplier, suffix } = await seedFlowerItem(moduleRef, auth, {
    expirationTracking: false,
    codePrefix: 'FIFO',
  });

  await receiveStock(moduleRef, auth, {
    itemId: item.id,
    supplierId: supplier.id,
    quantity: '5',
    unitPrice: '10',
    receivedAt: '2026-07-01T10:00:00.000Z',
    idempotencyKey: `fifo-a-${suffix}`,
  });
  await receiveStock(moduleRef, auth, {
    itemId: item.id,
    supplierId: supplier.id,
    quantity: '5',
    unitPrice: '12',
    receivedAt: '2026-07-02T10:00:00.000Z',
    idempotencyKey: `fifo-b-${suffix}`,
  });

  const doc = await writeOffs.create({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    warehouseId: auth.warehouseId,
    reason: 'DAMAGED',
  });
  const withItem = await writeOffs.addItem({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    writeOffId: doc.id,
    itemId: item.id,
    quantity: '6',
  });
  const key = `fifo-post-${suffix}`;
  const posted = await writeOffs.post({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    writeOffId: withItem.id,
    idempotencyKey: key,
  });
  assert.equal(posted.status, 'POSTED');

  const replay = await writeOffs.post({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    writeOffId: withItem.id,
    idempotencyKey: key,
  });
  assert.equal(replay.status, 'POSTED');

  const batches = await inventory.listBatches(auth.organizationId, auth.storeId, auth.warehouseId);
  const itemBatches = batches
    .filter((row) => row.itemId === item.id)
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  assert.equal(itemBatches[0]?.remainingQuantity, '0');
  assert.equal(itemBatches[1]?.remainingQuantity, '4');

  const movements = await moduleRef.get(PrismaService).inventoryMovement.findMany({
    where: { sourceDocumentId: doc.id, type: 'WRITE_OFF' },
  });
  assert.equal(movements.length, 2);

  await teardown(moduleRef);
});

test('write-off rolls back inventory when audit append fails', { skip: !runIntegration }, async () => {
  const auth = await bootstrapDirector();
  let calls = 0;
  const failingAudit: AuditPort = {
    async append() {
      calls += 1;
      throw new Error('audit failed');
    },
  };

  const moduleRef = await Test.createTestingModule({
    imports: [InfrastructureModule, OrganizationModule, MasterDataModule, InventoryModule, SupplyModule],
  })
    .overrideProvider(AUDIT_PORT)
    .useValue(failingAudit)
    .compile();
  await moduleRef.get(PrismaService).$connect();

  const writeOffs = moduleRef.get(WriteOffUseCases);
  const inventory = moduleRef.get(InventoryQueryUseCases);
  const { item, supplier, suffix } = await seedFlowerItem(moduleRef, auth, { codePrefix: 'AUD' });
  await receiveStock(moduleRef, auth, {
    itemId: item.id,
    supplierId: supplier.id,
    quantity: '5',
    unitPrice: '8',
    receivedAt: new Date().toISOString(),
    idempotencyKey: `aud-rcpt-${suffix}`,
  });

  const doc = await writeOffs.create({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    warehouseId: auth.warehouseId,
    reason: 'WILTED',
  });
  await writeOffs.addItem({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    writeOffId: doc.id,
    itemId: item.id,
    quantity: '2',
  });

  await assert.rejects(() =>
    writeOffs.post({
      organizationId: auth.organizationId,
      storeId: auth.storeId,
      writeOffId: doc.id,
      idempotencyKey: `aud-fail-${suffix}`,
    }),
  );
  assert.equal(calls, 1);

  const current = await writeOffs.get(auth.organizationId, auth.storeId, doc.id);
  assert.equal(current.status, 'DRAFT');

  const balances = await inventory.listBalances(auth.organizationId, auth.storeId, auth.warehouseId);
  assert.equal(balances.find((row) => row.itemId === item.id)?.onHandQuantity, '5');

  await teardown(moduleRef);
});

test('inventory count reconciles movements after cutoff (blind count, negative adjustment)', {
  skip: !runIntegration,
}, async () => {
  const auth = await bootstrapDirector();
  const moduleRef = await bootInventoryOps();
  const counts = moduleRef.get(InventoryCountUseCases);
  const writeOffs = moduleRef.get(WriteOffUseCases);
  const inventory = moduleRef.get(InventoryQueryUseCases);
  const { item, supplier, suffix } = await seedFlowerItem(moduleRef, auth, { codePrefix: 'CUT' });

  await receiveStock(moduleRef, auth, {
    itemId: item.id,
    supplierId: supplier.id,
    quantity: '10',
    unitPrice: '15',
    receivedAt: '2026-07-10T10:00:00.000Z',
    idempotencyKey: `cut-rcpt-${suffix}`,
  });

  const count = await counts.create({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    warehouseId: auth.warehouseId,
  });
  assert.ok(count.cutoffAt);
  const itemRow = count.items.find((row) => row.itemId === item.id);
  assert.ok(itemRow);
  assert.equal(itemRow!.expectedQuantity.toString(), '10');

  const wo = await writeOffs.create({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    warehouseId: auth.warehouseId,
    reason: 'WILTED',
  });
  await writeOffs.addItem({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    writeOffId: wo.id,
    itemId: item.id,
    quantity: '2',
  });
  await writeOffs.post({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    writeOffId: wo.id,
    idempotencyKey: `cut-wo-${suffix}`,
  });

  const counted = await counts.count({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    inventoryCountId: count.id,
    expectedVersion: count.version,
    items: [{ inventoryCountItemId: itemRow!.id, countedQuantity: '8' }],
  });
  assert.equal(counted.status, 'COUNTED');
  assert.equal(counted.items[0]?.countedQuantity?.toString(), '8');

  const posted = await counts.post({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    inventoryCountId: count.id,
    expectedVersion: counted.version,
    idempotencyKey: `cut-post-${suffix}`,
  });
  assert.equal(posted.status, 'POSTED');

  const replay = await counts.post({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    inventoryCountId: count.id,
    expectedVersion: posted.version,
    idempotencyKey: `cut-post-${suffix}`,
  });
  assert.equal(replay.status, 'POSTED');

  const balances = await inventory.listBalances(auth.organizationId, auth.storeId, auth.warehouseId);
  assert.equal(balances.find((row) => row.itemId === item.id)?.onHandQuantity, '8');

  await teardown(moduleRef);
});

test('inventory count positive adjustment uses weighted average cost', { skip: !runIntegration }, async () => {
  const auth = await bootstrapDirector();
  const moduleRef = await bootInventoryOps();
  const counts = moduleRef.get(InventoryCountUseCases);
  const inventory = moduleRef.get(InventoryQueryUseCases);
  const prisma = moduleRef.get(PrismaService);
  const { item, supplier, suffix } = await seedFlowerItem(moduleRef, auth, { codePrefix: 'WAC' });

  await receiveStock(moduleRef, auth, {
    itemId: item.id,
    supplierId: supplier.id,
    quantity: '4',
    unitPrice: '10',
    receivedAt: '2026-07-01T10:00:00.000Z',
    idempotencyKey: `wac-a-${suffix}`,
  });
  await receiveStock(moduleRef, auth, {
    itemId: item.id,
    supplierId: supplier.id,
    quantity: '6',
    unitPrice: '20',
    receivedAt: '2026-07-02T10:00:00.000Z',
    idempotencyKey: `wac-b-${suffix}`,
  });

  const count = await counts.create({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    warehouseId: auth.warehouseId,
  });
  const itemRow = count.items.find((row) => row.itemId === item.id)!;
  const counted = await counts.count({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    inventoryCountId: count.id,
    expectedVersion: count.version,
    items: [{ inventoryCountItemId: itemRow.id, countedQuantity: '12' }],
  });
  await counts.post({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    inventoryCountId: count.id,
    expectedVersion: counted.version,
    idempotencyKey: `wac-post-${suffix}`,
  });

  const adjustmentBatch = await prisma.inventoryBatch.findFirst({
    where: { itemId: item.id, batchSourceType: 'COUNT_ADJUSTMENT' },
    orderBy: { createdAt: 'desc' },
  });
  assert.ok(adjustmentBatch);
  assert.equal(adjustmentBatch!.unitCost.toString(), '16');

  const balances = await inventory.listBalances(auth.organizationId, auth.storeId, auth.warehouseId);
  assert.equal(balances.find((row) => row.itemId === item.id)?.onHandQuantity, '12');

  await teardown(moduleRef);
});

test('transfer dispatch clears source, destination empty until receive; preserves unit cost', {
  skip: !runIntegration,
}, async () => {
  const auth = await bootstrapDirector();
  const moduleRef = await bootInventoryOps();
  const orgs = moduleRef.get(OrganizationUseCases);
  const transfers = moduleRef.get(TransferUseCases);
  const inventory = moduleRef.get(InventoryQueryUseCases);
  const prisma = moduleRef.get(PrismaService);
  const { item, supplier, suffix } = await seedFlowerItem(moduleRef, auth, { codePrefix: 'TRN' });

  const destination = await orgs.createStoreWithDefaultWarehouse({
    organizationId: auth.organizationId,
    name: 'Dest',
    code: `DST${suffix}`,
  });

  await receiveStock(moduleRef, auth, {
    itemId: item.id,
    supplierId: supplier.id,
    quantity: '10',
    unitPrice: '9',
    receivedAt: new Date().toISOString(),
    idempotencyKey: `trn-rcpt-${suffix}`,
  });

  const transfer = await transfers.create({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    fromWarehouseId: auth.warehouseId,
    toWarehouseId: destination.warehouse.id,
  });
  const withItem = await transfers.addItem({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    transferId: transfer.id,
    itemId: item.id,
    requestedQuantity: '4',
  });
  const transferItem = withItem.items[0]!;

  const dispatched = await transfers.dispatch({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    transferId: transfer.id,
    expectedVersion: withItem.version,
    idempotencyKey: `trn-dispatch-${suffix}`,
    items: [{ transferItemId: transferItem.id, dispatchQuantity: '4' }],
  });
  assert.equal(dispatched.status, 'DISPATCHED');

  const dispatchReplay = await transfers.dispatch({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    transferId: transfer.id,
    expectedVersion: dispatched.version,
    idempotencyKey: `trn-dispatch-${suffix}`,
    items: [{ transferItemId: transferItem.id, dispatchQuantity: '4' }],
  });
  assert.equal(dispatchReplay.status, 'DISPATCHED');

  const sourceBalances = await inventory.listBalances(auth.organizationId, auth.storeId, auth.warehouseId);
  assert.equal(sourceBalances.find((row) => row.itemId === item.id)?.onHandQuantity, '6');

  const destBefore = await inventory.listBalances(
    auth.organizationId,
    destination.store.id,
    destination.warehouse.id,
  );
  assert.equal(destBefore.find((row) => row.itemId === item.id)?.onHandQuantity ?? '0', '0');

  const allocation = dispatched.allocations[0]!;
  const received = await transfers.receive({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    transferId: transfer.id,
    expectedVersion: dispatched.version,
    idempotencyKey: `trn-receive-${suffix}`,
    allocations: [{
      transferAllocationId: allocation.id,
      transferItemId: allocation.transferItemId,
      itemId: item.id,
      receivedQuantity: '4',
      damagedQuantity: '0',
    }],
  });
  assert.equal(received.status, 'RECEIVED');

  const destBatch = await prisma.inventoryBatch.findFirst({
    where: {
      organizationId: auth.organizationId,
      storeId: destination.store.id,
      warehouseId: destination.warehouse.id,
      itemId: item.id,
      batchSourceType: 'TRANSFER',
    },
  });
  assert.equal(destBatch?.unitCost.toString(), '9');

  await teardown(moduleRef);
});

test('transfer receive is idempotent and rejects concurrent duplicate receive', { skip: !runIntegration }, async () => {
  const auth = await bootstrapDirector();
  const moduleRef = await bootInventoryOps();
  const orgs = moduleRef.get(OrganizationUseCases);
  const transfers = moduleRef.get(TransferUseCases);
  const inventory = moduleRef.get(InventoryQueryUseCases);
  const { item, supplier, suffix } = await seedFlowerItem(moduleRef, auth, { codePrefix: 'CRC' });

  const destination = await orgs.createStoreWithDefaultWarehouse({
    organizationId: auth.organizationId,
    name: 'Dest2',
    code: `DS2${suffix}`,
  });
  await receiveStock(moduleRef, auth, {
    itemId: item.id,
    supplierId: supplier.id,
    quantity: '5',
    unitPrice: '7',
    receivedAt: new Date().toISOString(),
    idempotencyKey: `crc-rcpt-${suffix}`,
  });

  const transfer = await transfers.create({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    fromWarehouseId: auth.warehouseId,
    toWarehouseId: destination.warehouse.id,
  });
  const withItem = await transfers.addItem({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    transferId: transfer.id,
    itemId: item.id,
    requestedQuantity: '3',
  });
  const dispatched = await transfers.dispatch({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    transferId: transfer.id,
    expectedVersion: withItem.version,
    idempotencyKey: `crc-dispatch-${suffix}`,
    items: [{ transferItemId: withItem.items[0]!.id, dispatchQuantity: '3' }],
  });
  const allocation = dispatched.allocations[0]!;
  const receiveInput = {
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    transferId: transfer.id,
    expectedVersion: dispatched.version,
    idempotencyKey: `crc-receive-${suffix}`,
    allocations: [{
      transferAllocationId: allocation.id,
      transferItemId: allocation.transferItemId,
      itemId: item.id,
      receivedQuantity: '3',
      damagedQuantity: '0',
    }],
  };

  const [first, second] = await Promise.allSettled([
    transfers.receive(receiveInput),
    transfers.receive({ ...receiveInput, idempotencyKey: `crc-receive-dup-${suffix}` }),
  ]);
  const fulfilled = [first, second].filter((result) => result.status === 'fulfilled');
  const rejected = [first, second].filter((result) => result.status === 'rejected');
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);

  const replay = await transfers.receive(receiveInput);
  assert.equal(replay.status, 'RECEIVED');

  const destBalances = await inventory.listBalances(
    auth.organizationId,
    destination.store.id,
    destination.warehouse.id,
  );
  assert.equal(destBalances.find((row) => row.itemId === item.id)?.onHandQuantity, '3');

  await teardown(moduleRef);
});

test('inventory count blocks second active count per warehouse', { skip: !runIntegration }, async () => {
  const auth = await bootstrapDirector();
  const moduleRef = await bootInventoryOps();
  const counts = moduleRef.get(InventoryCountUseCases);
  const { item, supplier, suffix } = await seedFlowerItem(moduleRef, auth, { codePrefix: 'ACT' });
  await receiveStock(moduleRef, auth, {
    itemId: item.id,
    supplierId: supplier.id,
    quantity: '3',
    unitPrice: '5',
    receivedAt: new Date().toISOString(),
    idempotencyKey: `act-rcpt-${suffix}`,
  });

  await counts.create({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    warehouseId: auth.warehouseId,
  });

  await assert.rejects(
    () =>
      counts.create({
        organizationId: auth.organizationId,
        storeId: auth.storeId,
        warehouseId: auth.warehouseId,
      }),
    (error: unknown) => {
      const prismaCode = (error as { code?: string })?.code;
      return prismaCode === 'P2002' || error instanceof ConflictException;
    },
  );

  await teardown(moduleRef);
});

test('EPIC 12 schema: partial indexes, CHECK constraints, ON DELETE RESTRICT', { skip: !runIntegration }, async () => {
  const auth = await bootstrapDirector();
  const moduleRef = await bootInventoryOps();
  const prisma = moduleRef.get(PrismaService);
  const writeOffs = moduleRef.get(WriteOffUseCases);
  const { item } = await seedFlowerItem(moduleRef, auth, { codePrefix: 'SCH' });

  const partialIndexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'inventory_counts_one_active_per_warehouse'`;
  assert.equal(partialIndexes.length, 1);

  const checks = await prisma.$queryRaw<Array<{ conname: string }>>`
    SELECT conname FROM pg_constraint
    WHERE conname IN (
      'write_off_items_quantity_check',
      'transfer_items_requested_quantity_check',
      'transfer_allocations_quantity_dispatched_check',
      'inventory_count_items_expected_quantity_check',
      'transfer_documents_warehouses_differ_check'
    )`;
  assert.equal(checks.length, 5);

  const doc = await writeOffs.create({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    warehouseId: auth.warehouseId,
    reason: 'DAMAGED',
  });
  await assert.rejects(
    () =>
      prisma.writeOffItem.create({
        data: {
          id: crypto.randomUUID(),
          organizationId: auth.organizationId,
          writeOffDocumentId: doc.id,
          itemId: item.id,
          quantity: 0,
        },
      }),
    (error: unknown) =>
      String(error).includes('write_off_items_quantity_check') ||
      (error as { code?: string })?.code === 'P2003' ||
      (error as { code?: string })?.code === '23514',
  );

  const restrictFk = await prisma.$queryRaw<Array<{ conname: string }>>`
    SELECT conname FROM pg_constraint
    WHERE contype = 'f'
      AND conname LIKE '%write_off_items%'
      AND confdeltype = 'r'`;
  assert.ok(restrictFk.length >= 1);

  await teardown(moduleRef);
});
