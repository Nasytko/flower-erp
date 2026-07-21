import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service.js';
import { InfrastructureModule } from '../../src/infrastructure/infrastructure.module.js';
import { OrganizationModule } from '../../src/modules/organization/organization.module.js';
import { MasterDataModule } from '../../src/modules/master-data/master-data.module.js';
import { InventoryModule } from '../../src/modules/inventory/inventory.module.js';
import { SupplyModule } from '../../src/modules/supply/supply.module.js';
import { OrganizationUseCases } from '../../src/modules/organization/application/organization.use-cases.js';
import { ItemUseCases } from '../../src/modules/master-data/application/item.use-cases.js';
import { CategoryUseCases } from '../../src/modules/master-data/application/category.use-cases.js';
import { UnitUseCases } from '../../src/modules/master-data/application/unit.use-cases.js';
import { PolicyUseCases } from '../../src/modules/master-data/application/policy.use-cases.js';
import { SupplierUseCases } from '../../src/modules/master-data/application/supplier.use-cases.js';
import { GoodsReceiptUseCases, SupplyUseCases } from '../../src/modules/supply/application/supply.use-cases.js';
import { InventoryQueryUseCases } from '../../src/modules/inventory/application/inventory-query.use-cases.js';
import { ItemType, TrackingMethod } from '../../src/modules/master-data/domain/master-data-rules.js';

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

async function seed(moduleRef: Awaited<ReturnType<typeof boot>>) {
  const orgs = moduleRef.get(OrganizationUseCases);
  const categories = moduleRef.get(CategoryUseCases);
  const units = moduleRef.get(UnitUseCases);
  const policies = moduleRef.get(PolicyUseCases);
  const items = moduleRef.get(ItemUseCases);
  const suppliers = moduleRef.get(SupplierUseCases);
  const suffix = Date.now().toString().slice(-6);

  const org = await orgs.createOrganization({ name: `Supply Org ${suffix}` });
  const storeBundle = await orgs.createStoreWithDefaultWarehouse({
    organizationId: org.id,
    name: 'Salon',
    code: `S${suffix.slice(-5)}`,
  });
  const category = await categories.createCategory({
    organizationId: org.id,
    name: 'Roses',
    code: `C-${suffix}`,
  });
  const unit = await units.createUnit({
    organizationId: org.id,
    name: 'шт',
    symbol: `u${suffix.slice(-3)}`,
    quantityScale: 0,
  });
  const policy = await policies.createInventoryPolicy({
    organizationId: org.id,
    name: 'Flower',
    itemType: ItemType.FLOWER,
    trackingMethod: TrackingMethod.LOT,
    expirationTracking: true,
    defaultShelfLifeDays: 5,
  });
  const item = await items.createItem({
    organizationId: org.id,
    categoryId: category.id,
    unitId: unit.id,
    inventoryPolicyId: policy.id,
    name: 'Rose',
    code: `I-${suffix}`,
    itemType: ItemType.FLOWER,
    isPurchasable: true,
  });
  const supplier = await suppliers.createSupplier({
    organizationId: org.id,
    name: 'Grower',
    code: `SUP${suffix.slice(-4)}`,
  });

  return {
    org,
    storeId: storeBundle.store.id,
    warehouseId: storeBundle.warehouse.id,
    item,
    supplier,
    items,
    suffix,
  };
}

test('supply post creates batch+movement+balance; over-receipt and reverse', {
  skip: !runIntegration,
}, async () => {
  const moduleRef = await boot();
  const supplies = moduleRef.get(SupplyUseCases);
  const receipts = moduleRef.get(GoodsReceiptUseCases);
  const inventory = moduleRef.get(InventoryQueryUseCases);
  const ctx = await seed(moduleRef);

  const supply = await supplies.createSupply({
    organizationId: ctx.org.id,
    storeId: ctx.storeId,
    warehouseId: ctx.warehouseId,
    supplierId: ctx.supplier.id,
  });
  await supplies.addSupplyItem({
    organizationId: ctx.org.id,
    storeId: ctx.storeId,
    supplyId: supply.id,
    itemId: ctx.item.id,
    orderedQuantity: '10',
  });
  await supplies.submitSupply({
    organizationId: ctx.org.id,
    storeId: ctx.storeId,
    supplyId: supply.id,
  });

  const receipt = await receipts.createGoodsReceipt({
    organizationId: ctx.org.id,
    storeId: ctx.storeId,
    supplyId: supply.id,
    receivedAt: new Date().toISOString(),
  });
  const supplyFresh = await supplies.getSupply(ctx.org.id, ctx.storeId, supply.id);
  const supplyItemId = supplyFresh.items[0]!.id;

  await assert.rejects(
    () =>
      receipts.addGoodsReceiptItem({
        organizationId: ctx.org.id,
        storeId: ctx.storeId,
        goodsReceiptId: receipt.id,
        supplyItemId,
        receivedQuantity: '11',
        acceptedQuantity: '11',
        defectiveQuantity: '0',
        actualUnitPrice: '100',
      }),
    (err: unknown) => err instanceof ConflictException,
  );

  await receipts.addGoodsReceiptItem({
    organizationId: ctx.org.id,
    storeId: ctx.storeId,
    goodsReceiptId: receipt.id,
    supplyItemId,
    receivedQuantity: '10',
    acceptedQuantity: '8',
    defectiveQuantity: '2',
    actualUnitPrice: '100',
    defectReason: 'bruised',
  });

  await receipts.postGoodsReceipt({
    organizationId: ctx.org.id,
    storeId: ctx.storeId,
    goodsReceiptId: receipt.id,
    idempotencyKey: `post-${ctx.suffix}`,
  });

  const balances = await inventory.listBalances(ctx.org.id, ctx.storeId, ctx.warehouseId);
  assert.equal(
    balances.some((b) => b.itemId === ctx.item.id && String(b.onHandQuantity) === '8'),
    true,
  );

  const batches = await inventory.listBatches(ctx.org.id, ctx.storeId, ctx.warehouseId);
  assert.ok(batches.some((b) => b.itemId === ctx.item.id && b.expiresAt != null));

  await assert.rejects(
    () =>
      receipts.postGoodsReceipt({
        organizationId: ctx.org.id,
        storeId: ctx.storeId,
        goodsReceiptId: receipt.id,
        idempotencyKey: `post-again-${ctx.suffix}`,
      }),
    (err: unknown) => err instanceof ConflictException,
  );

  await receipts.reverseGoodsReceipt({
    organizationId: ctx.org.id,
    storeId: ctx.storeId,
    goodsReceiptId: receipt.id,
    idempotencyKey: `rev-${ctx.suffix}`,
  });
  const after = await inventory.listBalances(ctx.org.id, ctx.storeId, ctx.warehouseId);
  const bal = after.find((b) => b.itemId === ctx.item.id);
  assert.ok(bal);
  assert.equal(String(bal.onHandQuantity), '0');

  await assert.rejects(
    () =>
      receipts.reverseGoodsReceipt({
        organizationId: ctx.org.id,
        storeId: ctx.storeId,
        goodsReceiptId: receipt.id,
        idempotencyKey: `rev-2-${ctx.suffix}`,
      }),
    (err: unknown) => err instanceof ConflictException,
  );

  await moduleRef.get(PrismaService).$disconnect();
  await moduleRef.close();
});

test('archived item blocked on goods receipt post', { skip: !runIntegration }, async () => {
  const moduleRef = await boot();
  const supplies = moduleRef.get(SupplyUseCases);
  const receipts = moduleRef.get(GoodsReceiptUseCases);
  const ctx = await seed(moduleRef);

  const supply = await supplies.createSupply({
    organizationId: ctx.org.id,
    storeId: ctx.storeId,
    warehouseId: ctx.warehouseId,
    supplierId: ctx.supplier.id,
  });
  await supplies.addSupplyItem({
    organizationId: ctx.org.id,
    storeId: ctx.storeId,
    supplyId: supply.id,
    itemId: ctx.item.id,
    orderedQuantity: '5',
  });
  await supplies.submitSupply({
    organizationId: ctx.org.id,
    storeId: ctx.storeId,
    supplyId: supply.id,
  });
  const receipt = await receipts.createGoodsReceipt({
    organizationId: ctx.org.id,
    storeId: ctx.storeId,
    supplyId: supply.id,
    receivedAt: new Date().toISOString(),
  });
  const supplyFresh = await supplies.getSupply(ctx.org.id, ctx.storeId, supply.id);
  await receipts.addGoodsReceiptItem({
    organizationId: ctx.org.id,
    storeId: ctx.storeId,
    goodsReceiptId: receipt.id,
    supplyItemId: supplyFresh.items[0]!.id,
    receivedQuantity: '5',
    acceptedQuantity: '5',
    defectiveQuantity: '0',
    actualUnitPrice: '90',
  });

  await ctx.items.archiveItem({ organizationId: ctx.org.id, itemId: ctx.item.id });

  await assert.rejects(
    () =>
      receipts.postGoodsReceipt({
        organizationId: ctx.org.id,
        storeId: ctx.storeId,
        goodsReceiptId: receipt.id,
      }),
    (err: unknown) => err instanceof BadRequestException,
  );

  await moduleRef.get(PrismaService).$disconnect();
  await moduleRef.close();
});
