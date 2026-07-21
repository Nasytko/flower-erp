import { Test } from '@nestjs/testing';
import { PrismaService } from '../../../src/infrastructure/prisma/prisma.service.js';
import { InfrastructureModule } from '../../../src/infrastructure/infrastructure.module.js';
import { InventoryModule } from '../../../src/modules/inventory/inventory.module.js';
import { MasterDataModule } from '../../../src/modules/master-data/master-data.module.js';
import { OrdersModule } from '../../../src/modules/orders/orders.module.js';
import { OrganizationModule } from '../../../src/modules/organization/organization.module.js';
import { SupplyModule } from '../../../src/modules/supply/supply.module.js';
import { TransfersModule } from '../../../src/modules/transfers/transfers.module.js';
import type { TestAuthContext } from '../../helpers/auth-test.helper.js';

export const runIntegration =
  Boolean(process.env.DATABASE_URL) && process.env.SKIP_INTEGRATION !== '1';

export async function bootInventoryOps() {
  const moduleRef = await Test.createTestingModule({
    imports: [
      InfrastructureModule,
      OrganizationModule,
      MasterDataModule,
      InventoryModule,
      SupplyModule,
      OrdersModule,
      TransfersModule,
    ],
  }).compile();
  await moduleRef.get(PrismaService).$connect();
  return moduleRef;
}

export async function teardown(moduleRef: Awaited<ReturnType<typeof bootInventoryOps>>) {
  await moduleRef.get(PrismaService).$disconnect();
  await moduleRef.close();
}

export async function seedFlowerItem(
  moduleRef: Awaited<ReturnType<typeof bootInventoryOps>>,
  auth: TestAuthContext,
  options?: { expirationTracking?: boolean; codePrefix?: string },
) {
  const suffix = Date.now().toString().slice(-6);
  const prefix = options?.codePrefix ?? 'OPS';
  const { CategoryUseCases } = await import('../../../src/modules/master-data/application/category.use-cases.js');
  const { UnitUseCases } = await import('../../../src/modules/master-data/application/unit.use-cases.js');
  const { PolicyUseCases } = await import('../../../src/modules/master-data/application/policy.use-cases.js');
  const { ItemUseCases } = await import('../../../src/modules/master-data/application/item.use-cases.js');
  const { SupplierUseCases } = await import('../../../src/modules/master-data/application/supplier.use-cases.js');
  const { ItemType, TrackingMethod } = await import('../../../src/modules/master-data/domain/master-data-rules.js');

  const categories = moduleRef.get(CategoryUseCases);
  const units = moduleRef.get(UnitUseCases);
  const policies = moduleRef.get(PolicyUseCases);
  const items = moduleRef.get(ItemUseCases);
  const suppliers = moduleRef.get(SupplierUseCases);

  const category = await categories.createCategory({
    organizationId: auth.organizationId,
    name: 'Ops',
    code: `${prefix}-CAT-${suffix}`,
  });
  const unit = await units.createUnit({
    organizationId: auth.organizationId,
    name: 'шт',
    symbol: `${prefix.toLowerCase()}${suffix}`,
    quantityScale: 0,
  });
  const policy = await policies.createInventoryPolicy({
    organizationId: auth.organizationId,
    name: 'Flower',
    itemType: ItemType.FLOWER,
    trackingMethod: TrackingMethod.LOT,
    expirationTracking: options?.expirationTracking ?? true,
    defaultShelfLifeDays: 5,
  });
  const item = await items.createItem({
    organizationId: auth.organizationId,
    categoryId: category.id,
    unitId: unit.id,
    inventoryPolicyId: policy.id,
    name: 'Flower',
    code: `${prefix}-ITEM-${suffix}`,
    itemType: ItemType.FLOWER,
    isPurchasable: true,
  });
  const supplier = await suppliers.createSupplier({
    organizationId: auth.organizationId,
    name: 'Grower',
    code: `${prefix}-SUP-${suffix}`,
  });

  return { item, supplier, suffix };
}

export async function receiveStock(
  moduleRef: Awaited<ReturnType<typeof bootInventoryOps>>,
  auth: TestAuthContext,
  input: {
    itemId: string;
    supplierId: string;
    quantity: string;
    unitPrice: string;
    receivedAt: string;
    idempotencyKey: string;
  },
) {
  const { SupplyUseCases, GoodsReceiptUseCases } = await import(
    '../../../src/modules/supply/application/supply.use-cases.js'
  );
  const supplies = moduleRef.get(SupplyUseCases);
  const receipts = moduleRef.get(GoodsReceiptUseCases);

  const supply = await supplies.createSupply({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    warehouseId: auth.warehouseId,
    supplierId: input.supplierId,
  });
  const supplyItem = await supplies.addSupplyItem({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    supplyId: supply.id,
    itemId: input.itemId,
    orderedQuantity: input.quantity,
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
    receivedAt: input.receivedAt,
  });
  await receipts.addGoodsReceiptItem({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    goodsReceiptId: receipt.id,
    supplyItemId: supplyItem.id,
    receivedQuantity: input.quantity,
    acceptedQuantity: input.quantity,
    defectiveQuantity: '0',
    actualUnitPrice: input.unitPrice,
  });
  await receipts.postGoodsReceipt({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    goodsReceiptId: receipt.id,
    idempotencyKey: input.idempotencyKey,
  });
}
