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
import { OrderUseCases } from '../../src/modules/orders/application/order.use-cases.js';
import { CustomerUseCases } from '../../src/modules/orders/application/customer.use-cases.js';
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
    ],
  }).compile();
  await moduleRef.get(PrismaService).$connect();
  return moduleRef;
}

test('composition confirm: full reserve, partial, assignment, ready without stock issue', {
  skip: !runIntegration,
}, async () => {
  const auth = await bootstrapDirector();
  const moduleRef = await boot();
  const orders = moduleRef.get(OrderUseCases);
  const customers = moduleRef.get(CustomerUseCases);
  const supplies = moduleRef.get(SupplyUseCases);
  const receipts = moduleRef.get(GoodsReceiptUseCases);
  const inventory = moduleRef.get(InventoryQueryUseCases);
  const categories = moduleRef.get(CategoryUseCases);
  const units = moduleRef.get(UnitUseCases);
  const policies = moduleRef.get(PolicyUseCases);
  const items = moduleRef.get(ItemUseCases);
  const suppliers = moduleRef.get(SupplierUseCases);
  const suffix = Date.now().toString().slice(-6);

  const customer = await customers.createCustomer({
    organizationId: auth.organizationId,
    name: 'Anna',
    phone: `+7900${suffix}`,
  });

  const category = await categories.createCategory({
    organizationId: auth.organizationId,
    name: 'Ord',
    code: `OC-${suffix}`,
  });
  const unit = await units.createUnit({
    organizationId: auth.organizationId,
    name: 'шт',
    symbol: `ou${suffix}`,
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
  const item = await items.createItem({
    organizationId: auth.organizationId,
    categoryId: category.id,
    unitId: unit.id,
    inventoryPolicyId: policy.id,
    name: 'Tulip',
    code: `T-${suffix}`,
    itemType: ItemType.FLOWER,
    isPurchasable: true,
  });
  const supplier = await suppliers.createSupplier({
    organizationId: auth.organizationId,
    name: 'Grower',
    code: `OS${suffix}`,
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
    orderedQuantity: '10',
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
    receivedQuantity: '10',
    acceptedQuantity: '10',
    defectiveQuantity: '0',
    actualUnitPrice: '20',
  });
  await receipts.postGoodsReceipt({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    goodsReceiptId: receipt.id,
    idempotencyKey: `ord-stock-${suffix}`,
  });

  const order = await orders.createOrder({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    warehouseId: auth.warehouseId,
    customerId: customer.id,
    readyAt: new Date(Date.now() + 3600_000).toISOString(),
  });
  await orders.addCompositionItem({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    orderId: order.id,
    itemId: item.id,
    quantity: '4',
  });

  const confirmed = await orders.confirmOrder({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    orderId: order.id,
  });
  assert.equal(confirmed.status, 'RESERVED');
  assert.ok(confirmed.timeline?.some((e) => e.type === 'RESERVATION_SUCCEEDED' || e.type === 'CONFIRMED'));

  const balances = await inventory.listBalances(
    auth.organizationId,
    auth.storeId,
    auth.warehouseId,
  );
  const bal = balances.find((b) => b.itemId === item.id);
  assert.equal(bal!.reservedQuantity, '4');
  assert.equal(bal!.availableQuantity, '6');

  const short = await orders.createOrder({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    warehouseId: auth.warehouseId,
  });
  await orders.addCompositionItem({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    orderId: short.id,
    itemId: item.id,
    quantity: '100',
  });
  const partial = await orders.confirmOrder({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    orderId: short.id,
  });
  assert.equal(partial.status, 'PARTIALLY_RESERVED');

  // membershipId from bootstrap — use director membership via prisma
  const prisma = moduleRef.get(PrismaService);
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

  const inPrep = await orders.getOrder(auth.organizationId, auth.storeId, order.id);
  await orders.updateActualComposition({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    orderId: order.id,
    expectedVersion: inPrep.version,
    items: [{ itemId: item.id, quantity: '3', comment: 'trimmed' }],
  });

  const ready = await orders.markReady({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    orderId: order.id,
  });
  assert.equal(ready.status, 'READY');
  assert.ok(ready.actualComposition?.frozenAt);

  // Still reserved — no stock issue on READY
  const afterReady = await inventory.listBalances(
    auth.organizationId,
    auth.storeId,
    auth.warehouseId,
  );
  const balReady = afterReady.find((b) => b.itemId === item.id);
  assert.ok(Number(balReady!.reservedQuantity) > 0);

  const dash = await orders.getDashboard(auth.organizationId, auth.storeId);
  assert.ok(Array.isArray(dash.partiallyReserved));
  assert.ok(Array.isArray(dash.unassigned));

  await moduleRef.get(PrismaService).$disconnect();
  await moduleRef.close();
});
