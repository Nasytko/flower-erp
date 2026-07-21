import '../helpers/test-env.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service.js';
import { InfrastructureModule } from '../../src/infrastructure/infrastructure.module.js';
import { InventoryCountUseCases } from '../../src/modules/inventory/application/inventory-count.use-cases.js';
import { InventoryQueryUseCases } from '../../src/modules/inventory/application/inventory-query.use-cases.js';
import { WriteOffUseCases } from '../../src/modules/inventory/application/write-off.use-cases.js';
import { InventoryModule } from '../../src/modules/inventory/inventory.module.js';
import { CategoryUseCases } from '../../src/modules/master-data/application/category.use-cases.js';
import { ItemUseCases } from '../../src/modules/master-data/application/item.use-cases.js';
import { PolicyUseCases } from '../../src/modules/master-data/application/policy.use-cases.js';
import { SupplierUseCases } from '../../src/modules/master-data/application/supplier.use-cases.js';
import { UnitUseCases } from '../../src/modules/master-data/application/unit.use-cases.js';
import { ItemType, TrackingMethod } from '../../src/modules/master-data/domain/master-data-rules.js';
import { MasterDataModule } from '../../src/modules/master-data/master-data.module.js';
import { OrderUseCases } from '../../src/modules/orders/application/order.use-cases.js';
import { OrdersModule } from '../../src/modules/orders/orders.module.js';
import { GoodsReceiptUseCases, SupplyUseCases } from '../../src/modules/supply/application/supply.use-cases.js';
import { SupplyModule } from '../../src/modules/supply/supply.module.js';
import { bootstrapDirector } from '../helpers/auth-test.helper.js';

const DATABASE_URL = process.env.DATABASE_URL;
const runIntegration = Boolean(DATABASE_URL) && process.env.SKIP_INTEGRATION !== '1';

async function boot() {
  const moduleRef = await Test.createTestingModule({
    imports: [
      InfrastructureModule,
      MasterDataModule,
      InventoryModule,
      SupplyModule,
      OrdersModule,
    ],
  }).compile();
  await moduleRef.get(PrismaService).$connect();
  return moduleRef;
}

test('write-off uses FEFO, rejects reserved stock, and reverses', { skip: !runIntegration }, async () => {
  const auth = await bootstrapDirector();
  const moduleRef = await boot();
  const categories = moduleRef.get(CategoryUseCases);
  const units = moduleRef.get(UnitUseCases);
  const policies = moduleRef.get(PolicyUseCases);
  const items = moduleRef.get(ItemUseCases);
  const suppliers = moduleRef.get(SupplierUseCases);
  const supplies = moduleRef.get(SupplyUseCases);
  const receipts = moduleRef.get(GoodsReceiptUseCases);
  const writeOffs = moduleRef.get(WriteOffUseCases);
  const inventory = moduleRef.get(InventoryQueryUseCases);
  const orders = moduleRef.get(OrderUseCases);
  const suffix = Date.now().toString().slice(-6);

  const category = await categories.createCategory({ organizationId: auth.organizationId, name: 'Ops', code: `OPS-${suffix}` });
  const unit = await units.createUnit({ organizationId: auth.organizationId, name: 'шт', symbol: `wo${suffix}`, quantityScale: 0 });
  const policy = await policies.createInventoryPolicy({
    organizationId: auth.organizationId,
    name: 'Flower',
    itemType: ItemType.FLOWER,
    trackingMethod: TrackingMethod.LOT,
    expirationTracking: true,
    defaultShelfLifeDays: 2,
  });
  const item = await items.createItem({
    organizationId: auth.organizationId,
    categoryId: category.id,
    unitId: unit.id,
    inventoryPolicyId: policy.id,
    name: 'Rose',
    code: `WO-${suffix}`,
    itemType: ItemType.FLOWER,
    isPurchasable: true,
  });
  const supplier = await suppliers.createSupplier({
    organizationId: auth.organizationId,
    name: 'Grower',
    code: `WG-${suffix}`,
  });

  async function receive(qty: string, dateIso: string) {
    const supply = await supplies.createSupply({
      organizationId: auth.organizationId,
      storeId: auth.storeId,
      warehouseId: auth.warehouseId,
      supplierId: supplier.id,
    });
    const supplyItem = await supplies.addSupplyItem({
      organizationId: auth.organizationId,
      storeId: auth.storeId,
      supplyId: supply.id,
      itemId: item.id,
      orderedQuantity: qty,
    });
    await supplies.submitSupply({ organizationId: auth.organizationId, storeId: auth.storeId, supplyId: supply.id });
    const receipt = await receipts.createGoodsReceipt({
      organizationId: auth.organizationId,
      storeId: auth.storeId,
      warehouseId: auth.warehouseId,
      supplyId: supply.id,
      receivedAt: dateIso,
    });
    await receipts.addGoodsReceiptItem({
      organizationId: auth.organizationId,
      storeId: auth.storeId,
      goodsReceiptId: receipt.id,
      supplyItemId: supplyItem.id,
      receivedQuantity: qty,
      acceptedQuantity: qty,
      defectiveQuantity: '0',
      actualUnitPrice: '10',
    });
    await receipts.postGoodsReceipt({
      organizationId: auth.organizationId,
      storeId: auth.storeId,
      goodsReceiptId: receipt.id,
      idempotencyKey: `wo-rcpt-${qty}-${dateIso}`,
    });
  }

  await receive('5', '2026-07-10T10:00:00.000Z');
  await receive('5', '2026-07-11T10:00:00.000Z');

  const order = await orders.createOrder({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    warehouseId: auth.warehouseId,
  });
  await orders.addCompositionItem({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    orderId: order.id,
    itemId: item.id,
    quantity: '3',
  });
  await orders.confirmOrder({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    orderId: order.id,
  });

  const blocked = await writeOffs.create({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    warehouseId: auth.warehouseId,
    reason: 'WILTED',
  });
  await writeOffs.addItem({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    writeOffId: blocked.id,
    itemId: item.id,
    quantity: '8',
  });
  await assert.rejects(
    () =>
      writeOffs.post({
        organizationId: auth.organizationId,
        storeId: auth.storeId,
        writeOffId: blocked.id,
        idempotencyKey: `wo-block-${suffix}`,
      }),
    (error: unknown) => error instanceof ConflictException,
  );

  const doc = await writeOffs.create({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    warehouseId: auth.warehouseId,
    reason: 'WILTED',
  });
  const withItem = await writeOffs.addItem({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    writeOffId: doc.id,
    itemId: item.id,
    quantity: '7',
  });
  const posted = await writeOffs.post({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    writeOffId: withItem.id,
    idempotencyKey: `wo-post-${suffix}`,
  });
  assert.equal(posted.status, 'POSTED');

  const batches = await inventory.listBatches(auth.organizationId, auth.storeId, auth.warehouseId);
  const itemBatches = batches.filter((row) => row.itemId === item.id);
  assert.equal(itemBatches[0]?.remainingQuantity, '0');
  assert.equal(itemBatches[1]?.remainingQuantity, '3');

  const reversed = await writeOffs.reverse({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    writeOffId: doc.id,
    idempotencyKey: `wo-rev-${suffix}`,
  });
  assert.equal(reversed.status, 'REVERSED');

  await moduleRef.get(PrismaService).$disconnect();
  await moduleRef.close();
});

test('inventory count reconcile posts adjustments and detects version conflict', { skip: !runIntegration }, async () => {
  const auth = await bootstrapDirector();
  const moduleRef = await boot();
  const categories = moduleRef.get(CategoryUseCases);
  const units = moduleRef.get(UnitUseCases);
  const policies = moduleRef.get(PolicyUseCases);
  const items = moduleRef.get(ItemUseCases);
  const suppliers = moduleRef.get(SupplierUseCases);
  const supplies = moduleRef.get(SupplyUseCases);
  const receipts = moduleRef.get(GoodsReceiptUseCases);
  const counts = moduleRef.get(InventoryCountUseCases);
  const inventory = moduleRef.get(InventoryQueryUseCases);
  const suffix = Date.now().toString().slice(-6);

  const category = await categories.createCategory({ organizationId: auth.organizationId, name: 'Count', code: `CNT-${suffix}` });
  const unit = await units.createUnit({ organizationId: auth.organizationId, name: 'шт', symbol: `ct${suffix}`, quantityScale: 0 });
  const policy = await policies.createInventoryPolicy({
    organizationId: auth.organizationId,
    name: 'Flower',
    itemType: ItemType.FLOWER,
    trackingMethod: TrackingMethod.LOT,
    expirationTracking: true,
    defaultShelfLifeDays: 2,
  });
  const item = await items.createItem({
    organizationId: auth.organizationId,
    categoryId: category.id,
    unitId: unit.id,
    inventoryPolicyId: policy.id,
    name: 'Peony',
    code: `PC-${suffix}`,
    itemType: ItemType.FLOWER,
    isPurchasable: true,
  });
  const supplier = await suppliers.createSupplier({ organizationId: auth.organizationId, name: 'Grower', code: `CG-${suffix}` });

  const supply = await supplies.createSupply({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    warehouseId: auth.warehouseId,
    supplierId: supplier.id,
  });
  const supplyItem = await supplies.addSupplyItem({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    supplyId: supply.id,
    itemId: item.id,
    orderedQuantity: '5',
  });
  await supplies.submitSupply({ organizationId: auth.organizationId, storeId: auth.storeId, supplyId: supply.id });
  const receipt = await receipts.createGoodsReceipt({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    warehouseId: auth.warehouseId,
    supplyId: supply.id,
    receivedAt: new Date().toISOString(),
  });
  await receipts.addGoodsReceiptItem({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    goodsReceiptId: receipt.id,
    supplyItemId: supplyItem.id,
    receivedQuantity: '5',
    acceptedQuantity: '5',
    defectiveQuantity: '0',
    actualUnitPrice: '12',
  });
  await receipts.postGoodsReceipt({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    goodsReceiptId: receipt.id,
    idempotencyKey: `cnt-rcpt-${suffix}`,
  });

  const count = await counts.create({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    warehouseId: auth.warehouseId,
  });
  const itemRow = count.items.find((row) => row.itemId === item.id);
  assert.ok(itemRow);

  const counted = await counts.count({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    inventoryCountId: count.id,
    expectedVersion: count.version,
    items: [{ inventoryCountItemId: itemRow!.id, countedQuantity: '7' }],
  });
  assert.equal(counted.status, 'COUNTED');

  await assert.rejects(
    () =>
      counts.post({
        organizationId: auth.organizationId,
        storeId: auth.storeId,
        inventoryCountId: count.id,
        expectedVersion: count.version,
        idempotencyKey: `cnt-stale-${suffix}`,
      }),
    (error: unknown) => error instanceof ConflictException,
  );

  const posted = await counts.post({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    inventoryCountId: count.id,
    expectedVersion: counted.version,
    idempotencyKey: `cnt-post-${suffix}`,
  });
  assert.equal(posted.status, 'POSTED');

  const balances = await inventory.listBalances(auth.organizationId, auth.storeId, auth.warehouseId);
  const balance = balances.find((row) => row.itemId === item.id);
  assert.equal(balance?.onHandQuantity, '7');

  await moduleRef.get(PrismaService).$disconnect();
  await moduleRef.close();
});
