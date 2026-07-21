import assert from 'node:assert/strict';
import test from 'node:test';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service.js';
import { InfrastructureModule } from '../../src/infrastructure/infrastructure.module.js';
import { OrganizationModule } from '../../src/modules/organization/organization.module.js';
import { MasterDataModule } from '../../src/modules/master-data/master-data.module.js';
import { InventoryModule } from '../../src/modules/inventory/inventory.module.js';
import { SupplyModule } from '../../src/modules/supply/supply.module.js';
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
    imports: [InfrastructureModule, OrganizationModule, MasterDataModule, InventoryModule, SupplyModule],
  }).compile();
  const prisma = moduleRef.get(PrismaService);
  await prisma.$connect();
  return moduleRef;
}

test('parallel goods receipt posting preserves inventory balance', { skip: !runIntegration }, async () => {
  const auth = await bootstrapDirector();
  const moduleRef = await boot();
  const supplies = moduleRef.get(SupplyUseCases);
  const receipts = moduleRef.get(GoodsReceiptUseCases);
  const inventory = moduleRef.get(InventoryQueryUseCases);
  const categories = moduleRef.get(CategoryUseCases);
  const units = moduleRef.get(UnitUseCases);
  const policies = moduleRef.get(PolicyUseCases);
  const items = moduleRef.get(ItemUseCases);
  const suppliers = moduleRef.get(SupplierUseCases);
  const suffix = Date.now().toString().slice(-6);

  const category = await categories.createCategory({
    organizationId: auth.organizationId,
    name: 'Concurrent',
    code: `CC-${suffix}`,
  });
  const unit = await units.createUnit({
    organizationId: auth.organizationId,
    name: 'шт',
    symbol: `u${suffix}`,
    quantityScale: 0,
  });
  const policy = await policies.createInventoryPolicy({
    organizationId: auth.organizationId,
    name: 'Mat',
    itemType: ItemType.MATERIAL,
    trackingMethod: TrackingMethod.NONE,
    expirationTracking: false,
  });
  const item = await items.createItem({
    organizationId: auth.organizationId,
    categoryId: category.id,
    unitId: unit.id,
    inventoryPolicyId: policy.id,
    name: 'Ribbon',
    code: `R-${suffix}`,
    itemType: ItemType.MATERIAL,
    isPurchasable: true,
  });
  const supplier = await suppliers.createSupplier({
    organizationId: auth.organizationId,
    name: 'Supplier',
    code: `SUP${suffix}`,
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
    orderedQuantity: '20',
  });
  await supplies.submitSupply({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    supplyId: supply.id,
  });

  const receiptA = await receipts.createGoodsReceipt({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    warehouseId: auth.warehouseId,
    supplyId: supply.id,
    receivedAt: new Date().toISOString(),
  });
  await receipts.addGoodsReceiptItem({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    goodsReceiptId: receiptA.id,
    supplyItemId: supplyItem.id,
    receivedQuantity: '6',
    acceptedQuantity: '6',
    defectiveQuantity: '0',
    actualUnitPrice: '10',
  });

  const receiptB = await receipts.createGoodsReceipt({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    warehouseId: auth.warehouseId,
    supplyId: supply.id,
    receivedAt: new Date().toISOString(),
  });
  await receipts.addGoodsReceiptItem({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    goodsReceiptId: receiptB.id,
    supplyItemId: supplyItem.id,
    receivedQuantity: '7',
    acceptedQuantity: '7',
    defectiveQuantity: '0',
    actualUnitPrice: '10',
  });

  const results = await Promise.allSettled([
    receipts.postGoodsReceipt({
      organizationId: auth.organizationId,
      storeId: auth.storeId,
      goodsReceiptId: receiptA.id,
      idempotencyKey: `conc-a-${suffix}`,
    }),
    receipts.postGoodsReceipt({
      organizationId: auth.organizationId,
      storeId: auth.storeId,
      goodsReceiptId: receiptB.id,
      idempotencyKey: `conc-b-${suffix}`,
    }),
  ]);

  const fulfilled = results.filter((r) => r.status === 'fulfilled');
  assert.equal(fulfilled.length, 2, 'Both postings should succeed');

  const balances = await inventory.listBalances(
    auth.organizationId,
    auth.storeId,
    auth.warehouseId,
  );
  const row = balances.find((b) => b.itemId === item.id);
  assert.ok(row);
  assert.equal(row!.onHandQuantity, '13');

  const prisma = moduleRef.get(PrismaService);
  await prisma.$disconnect();
  await moduleRef.close();
});
