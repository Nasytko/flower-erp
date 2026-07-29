import '../helpers/test-env.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service.js';
import { InfrastructureModule } from '../../src/infrastructure/infrastructure.module.js';
import { OrganizationModule } from '../../src/modules/organization/organization.module.js';
import { MasterDataModule } from '../../src/modules/master-data/master-data.module.js';
import { InventoryModule } from '../../src/modules/inventory/inventory.module.js';
import { SupplyModule } from '../../src/modules/supply/supply.module.js';
import { OrdersModule } from '../../src/modules/orders/orders.module.js';
import { SalesModule } from '../../src/modules/sales/sales.module.js';
import { OrderUseCases } from '../../src/modules/orders/application/order.use-cases.js';
import { SaleUseCases } from '../../src/modules/sales/application/sale.use-cases.js';
import { GoodsReceiptUseCases, SupplyUseCases } from '../../src/modules/supply/application/supply.use-cases.js';
import { ItemUseCases } from '../../src/modules/master-data/application/item.use-cases.js';
import { CategoryUseCases } from '../../src/modules/master-data/application/category.use-cases.js';
import { PolicyUseCases } from '../../src/modules/master-data/application/policy.use-cases.js';
import { SupplierUseCases } from '../../src/modules/master-data/application/supplier.use-cases.js';
import { InventoryQueryUseCases } from '../../src/modules/inventory/application/inventory-query.use-cases.js';
import { ItemType, TrackingMethod } from '../../src/modules/master-data/domain/master-data-rules.js';
import { bootstrapDirector } from '../helpers/auth-test.helper.js';

const DATABASE_URL = process.env.DATABASE_URL;
const runIntegration = Boolean(DATABASE_URL) && process.env.SKIP_INTEGRATION !== '1';

async function boot() {
  const moduleRef = await Test.createTestingModule({
    imports: [
      InfrastructureModule,
      OrganizationModule,
      MasterDataModule,
      InventoryModule,
      SupplyModule,
      OrdersModule,
      SalesModule,
    ],
  }).compile();
  await moduleRef.get(PrismaService).$connect();
  return moduleRef;
}

type StockFixture = {
  auth: Awaited<ReturnType<typeof bootstrapDirector>>;
  itemId: string;
  moduleRef: Awaited<ReturnType<typeof boot>>;
  orders: OrderUseCases;
  sales: SaleUseCases;
  inventory: InventoryQueryUseCases;
  prisma: PrismaService;
};

async function stockFixture(qty: string): Promise<StockFixture> {
  const auth = await bootstrapDirector();
  const moduleRef = await boot();
  const orders = moduleRef.get(OrderUseCases);
  const sales = moduleRef.get(SaleUseCases);
  const supplies = moduleRef.get(SupplyUseCases);
  const receipts = moduleRef.get(GoodsReceiptUseCases);
  const inventory = moduleRef.get(InventoryQueryUseCases);
  const categories = moduleRef.get(CategoryUseCases);
  const policies = moduleRef.get(PolicyUseCases);
  const items = moduleRef.get(ItemUseCases);
  const suppliers = moduleRef.get(SupplierUseCases);
  const prisma = moduleRef.get(PrismaService);
  const suffix = Date.now().toString().slice(-6);

  const category = await categories.createCategory({
    organizationId: auth.organizationId,
    name: 'ResCat',
    code: `RC-${suffix}`,
  });
  const policy = await policies.createInventoryPolicy({
    organizationId: auth.organizationId,
    name: 'Flower',
    itemType: ItemType.FLOWER,
    trackingMethod: TrackingMethod.LOT,
    expirationTracking: true,
    defaultShelfLifeDays: 5,
  });
  const item = await items.createItem({
    organizationId: auth.organizationId,
    categoryId: category.id,
    inventoryPolicyId: policy.id,
    name: 'Stem',
    code: `S-${suffix}`,
    itemType: ItemType.FLOWER,
    isPurchasable: true,
    isSellable: true,
  });
  const supplier = await suppliers.createSupplier({
    organizationId: auth.organizationId,
    name: 'Grower',
    code: `RS${suffix}`,
  });
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
  await supplies.submitSupply({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    supplyId: supply.id,
  });
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
    receivedQuantity: qty,
    acceptedQuantity: qty,
    defectiveQuantity: '0',
    actualUnitPrice: '10',
  });
  await receipts.postGoodsReceipt({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    goodsReceiptId: receipt.id,
    idempotencyKey: `res-stock-${suffix}`,
  });

  return { auth, itemId: item.id, moduleRef, orders, sales, inventory, prisma };
}

async function teardown(ctx: StockFixture) {
  await ctx.prisma.$disconnect();
  await ctx.moduleRef.close();
}

function balance(ctx: StockFixture) {
  return ctx.inventory.listBalances(
    ctx.auth.organizationId,
    ctx.auth.storeId,
    ctx.auth.warehouseId,
  );
}

test('cancel order releases active reservation and restores available qty', { skip: !runIntegration }, async () => {
  const ctx = await stockFixture('10');
  const order = await ctx.orders.createOrder({
    organizationId: ctx.auth.organizationId,
    storeId: ctx.auth.storeId,
    warehouseId: ctx.auth.warehouseId,
  });
  await ctx.orders.addCompositionItem({
    organizationId: ctx.auth.organizationId,
    storeId: ctx.auth.storeId,
    orderId: order.id,
    itemId: ctx.itemId,
    quantity: '4',
  });
  await ctx.orders.reserveOrder({
    organizationId: ctx.auth.organizationId,
    storeId: ctx.auth.storeId,
    orderId: order.id,
  });

  let bal = (await balance(ctx)).find((b) => b.itemId === ctx.itemId)!;
  assert.equal(bal.reservedQuantity, '4');
  assert.equal(bal.availableQuantity, '6');

  await ctx.orders.cancelOrder({
    organizationId: ctx.auth.organizationId,
    storeId: ctx.auth.storeId,
    orderId: order.id,
    reason: 'test cancel',
  });

  bal = (await balance(ctx)).find((b) => b.itemId === ctx.itemId)!;
  assert.equal(bal.reservedQuantity, '0');
  assert.equal(bal.availableQuantity, '10');

  const activeReservations = await ctx.prisma.inventoryReservation.count({
    where: { organizationId: ctx.auth.organizationId, status: 'ACTIVE' },
  });
  assert.equal(activeReservations, 0);

  await teardown(ctx);
});

test('two orders compete for limited stock without over-reserving', { skip: !runIntegration }, async () => {
  const ctx = await stockFixture('5');
  const orderA = await ctx.orders.createOrder({
    organizationId: ctx.auth.organizationId,
    storeId: ctx.auth.storeId,
    warehouseId: ctx.auth.warehouseId,
  });
  await ctx.orders.addCompositionItem({
    organizationId: ctx.auth.organizationId,
    storeId: ctx.auth.storeId,
    orderId: orderA.id,
    itemId: ctx.itemId,
    quantity: '3',
  });
  await ctx.orders.reserveOrder({
    organizationId: ctx.auth.organizationId,
    storeId: ctx.auth.storeId,
    orderId: orderA.id,
  });

  const orderB = await ctx.orders.createOrder({
    organizationId: ctx.auth.organizationId,
    storeId: ctx.auth.storeId,
    warehouseId: ctx.auth.warehouseId,
  });
  await ctx.orders.addCompositionItem({
    organizationId: ctx.auth.organizationId,
    storeId: ctx.auth.storeId,
    orderId: orderB.id,
    itemId: ctx.itemId,
    quantity: '4',
  });
  const reservedB = await ctx.orders.reserveOrder({
    organizationId: ctx.auth.organizationId,
    storeId: ctx.auth.storeId,
    orderId: orderB.id,
  });
  assert.equal(reservedB.status, 'PARTIALLY_RESERVED');

  const bal = (await balance(ctx)).find((b) => b.itemId === ctx.itemId)!;
  assert.equal(bal.reservedQuantity, '5');
  assert.equal(bal.availableQuantity, '0');
  assert.ok(Number(bal.onHandQuantity) >= 5);

  await teardown(ctx);
});

test('completing sale twice does not double-issue stock', { skip: !runIntegration }, async () => {
  const ctx = await stockFixture('8');
  const order = await ctx.orders.createOrder({
    organizationId: ctx.auth.organizationId,
    storeId: ctx.auth.storeId,
    warehouseId: ctx.auth.warehouseId,
  });
  await ctx.orders.addCompositionItem({
    organizationId: ctx.auth.organizationId,
    storeId: ctx.auth.storeId,
    orderId: order.id,
    itemId: ctx.itemId,
    quantity: '2',
  });
  await ctx.orders.reserveOrder({
    organizationId: ctx.auth.organizationId,
    storeId: ctx.auth.storeId,
    orderId: order.id,
  });
  const inPrep = await ctx.orders.getOrder(ctx.auth.organizationId, ctx.auth.storeId, order.id);
  await ctx.orders.updateActualComposition({
    organizationId: ctx.auth.organizationId,
    storeId: ctx.auth.storeId,
    orderId: order.id,
    expectedVersion: inPrep.version,
    items: [{ itemId: ctx.itemId, quantity: '2' }],
  });
  await ctx.orders.markReady({
    organizationId: ctx.auth.organizationId,
    storeId: ctx.auth.storeId,
    orderId: order.id,
  });

  const sale = await ctx.sales.createOrderBasedSale({
    organizationId: ctx.auth.organizationId,
    storeId: ctx.auth.storeId,
    warehouseId: ctx.auth.warehouseId,
    orderId: order.id,
  });
  const key = `sale-complete-${Date.now()}`;
  await ctx.sales.completeSale(
    ctx.auth.organizationId,
    ctx.auth.storeId,
    sale.id,
    key,
  );

  const balAfterFirst = (await balance(ctx)).find((b) => b.itemId === ctx.itemId)!;
  assert.equal(balAfterFirst.onHandQuantity, '6');

  await assert.rejects(
    () =>
      ctx.sales.completeSale(
        ctx.auth.organizationId,
        ctx.auth.storeId,
        sale.id,
        `${key}-retry`,
      ),
    /cannot|already|status/i,
  );

  const balAfterRetry = (await balance(ctx)).find((b) => b.itemId === ctx.itemId)!;
  assert.equal(balAfterRetry.onHandQuantity, '6');

  await teardown(ctx);
});

test('reservation ledger table is not used after Stage C', { skip: !runIntegration }, async () => {
  const ctx = await stockFixture('3');
  const order = await ctx.orders.createOrder({
    organizationId: ctx.auth.organizationId,
    storeId: ctx.auth.storeId,
    warehouseId: ctx.auth.warehouseId,
  });
  await ctx.orders.addCompositionItem({
    organizationId: ctx.auth.organizationId,
    storeId: ctx.auth.storeId,
    orderId: order.id,
    itemId: ctx.itemId,
    quantity: '1',
  });
  await ctx.orders.reserveOrder({
    organizationId: ctx.auth.organizationId,
    storeId: ctx.auth.storeId,
    orderId: order.id,
  });

  const tables = await ctx.prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'reservation_movements'
    ) AS exists`;
  assert.equal(tables[0]?.exists, false);

  await teardown(ctx);
});
