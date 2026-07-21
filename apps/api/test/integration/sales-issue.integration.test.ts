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
import { UnitUseCases } from '../../src/modules/master-data/application/unit.use-cases.js';
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

test('order-based sale complete consumes reservations and issues stock; annul reverses', {
  skip: !runIntegration,
}, async () => {
  const auth = await bootstrapDirector();
  const moduleRef = await boot();
  const orders = moduleRef.get(OrderUseCases);
  const sales = moduleRef.get(SaleUseCases);
  const supplies = moduleRef.get(SupplyUseCases);
  const receipts = moduleRef.get(GoodsReceiptUseCases);
  const inventory = moduleRef.get(InventoryQueryUseCases);
  const categories = moduleRef.get(CategoryUseCases);
  const units = moduleRef.get(UnitUseCases);
  const policies = moduleRef.get(PolicyUseCases);
  const itemsUc = moduleRef.get(ItemUseCases);
  const suppliers = moduleRef.get(SupplierUseCases);
  const prisma = moduleRef.get(PrismaService);
  const suffix = Date.now().toString().slice(-6);

  const category = await categories.createCategory({
    organizationId: auth.organizationId,
    name: 'SaleCat',
    code: `SC-${suffix}`,
  });
  const unit = await units.createUnit({
    organizationId: auth.organizationId,
    name: 'шт',
    symbol: `su${suffix}`,
    quantityScale: 0,
  });
  const policy = await policies.createInventoryPolicy({
    organizationId: auth.organizationId,
    name: 'Flower',
    itemType: ItemType.FLOWER,
    trackingMethod: TrackingMethod.LOT,
    expirationTracking: true,
    defaultShelfLifeDays: 5,
  });
  const rose = await itemsUc.createItem({
    organizationId: auth.organizationId,
    categoryId: category.id,
    unitId: unit.id,
    inventoryPolicyId: policy.id,
    name: 'Rose',
    code: `R-${suffix}`,
    itemType: ItemType.FLOWER,
    isPurchasable: true,
    isSellable: true,
  });
  const eustoma = await itemsUc.createItem({
    organizationId: auth.organizationId,
    categoryId: category.id,
    unitId: unit.id,
    inventoryPolicyId: policy.id,
    name: 'Eustoma',
    code: `E-${suffix}`,
    itemType: ItemType.FLOWER,
    isPurchasable: true,
    isSellable: true,
  });
  const supplier = await suppliers.createSupplier({
    organizationId: auth.organizationId,
    name: 'Grower',
    code: `SS${suffix}`,
  });

  async function receive(itemId: string, qty: string) {
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
      itemId,
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
      idempotencyKey: `sale-rcpt-${itemId}-${suffix}-${qty}`,
    });
  }

  await receive(rose.id, '10');
  await receive(eustoma.id, '5');

  const order = await orders.createOrder({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    warehouseId: auth.warehouseId,
    plannedPrice: '120.00',
  });
  await orders.setPlannedComposition({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    orderId: order.id,
    items: [
      { itemId: rose.id, quantity: '7' },
      { itemId: eustoma.id, quantity: '3' },
    ],
  });
  await orders.confirmOrder({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    orderId: order.id,
  });

  const membership = await prisma.organizationMembership.findFirst({
    where: { organizationId: auth.organizationId },
  });
  assert.ok(membership);
  await orders.assignFlorist({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    orderId: order.id,
    membershipId: membership!.id,
  });
  await orders.startPreparation({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    orderId: order.id,
  });
  // Actual differs from planned: Rose 8, Eustoma 2
  const inPrep = await orders.getOrder(auth.organizationId, auth.storeId, order.id);
  await orders.updateActualComposition({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    orderId: order.id,
    expectedVersion: inPrep.version,
    items: [
      { itemId: rose.id, quantity: '8' },
      { itemId: eustoma.id, quantity: '2' },
    ],
  });
  await orders.markReady({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    orderId: order.id,
  });

  const draft = await sales.createSaleFromOrder({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    orderId: order.id,
  });
  assert.equal(draft.status, 'DRAFT');
  assert.equal(draft.type, 'ORDER_BASED');

  await assert.rejects(() =>
    sales.createSaleFromOrder({
      organizationId: auth.organizationId,
      storeId: auth.storeId,
      orderId: order.id,
    }),
  );

  const completed = await sales.completeSale({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    saleId: draft.id,
    idempotencyKey: `complete-${suffix}`,
  });
  assert.equal(completed.status, 'COMPLETED');
  assert.ok(completed.costAmount);
  assert.ok(Number(completed.costAmount) > 0);

  const replay = await sales.completeSale({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    saleId: draft.id,
    idempotencyKey: `complete-${suffix}`,
  });
  assert.equal(replay.status, 'COMPLETED');

  const orderAfter = await orders.getOrder(auth.organizationId, auth.storeId, order.id);
  assert.equal(orderAfter.status, 'COMPLETED');

  const issues = await prisma.inventoryMovement.count({
    where: { sourceDocumentId: draft.id, type: 'ISSUE' },
  });
  assert.ok(issues >= 2);

  const activeRes = await prisma.inventoryReservation.count({
    where: {
      organizationId: auth.organizationId,
      status: 'ACTIVE',
      itemId: { in: [rose.id, eustoma.id] },
    },
  });
  assert.equal(activeRes, 0);

  const balances = await inventory.listBalances(
    auth.organizationId,
    auth.storeId,
    auth.warehouseId,
  );
  const roseBal = balances.find((b) => b.itemId === rose.id);
  assert.equal(roseBal!.onHandQuantity, '2'); // 10 - 8

  const annulled = await sales.annulSale({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    saleId: draft.id,
    reason: 'Test annul',
    idempotencyKey: `annul-${suffix}`,
  });
  assert.equal(annulled.status, 'ANNULLED');

  const orderReady = await orders.getOrder(auth.organizationId, auth.storeId, order.id);
  assert.equal(orderReady.status, 'READY');

  await assert.rejects(() =>
    sales.annulSale({
      organizationId: auth.organizationId,
      storeId: auth.storeId,
      saleId: draft.id,
      reason: 'again',
      idempotencyKey: `annul2-${suffix}`,
    }),
  );

  await moduleRef.get(PrismaService).$disconnect();
  await moduleRef.close();
});
