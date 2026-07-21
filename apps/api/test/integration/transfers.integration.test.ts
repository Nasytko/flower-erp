import '../helpers/test-env.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service.js';
import { InfrastructureModule } from '../../src/infrastructure/infrastructure.module.js';
import { InventoryQueryUseCases } from '../../src/modules/inventory/application/inventory-query.use-cases.js';
import { InventoryModule } from '../../src/modules/inventory/inventory.module.js';
import { CategoryUseCases } from '../../src/modules/master-data/application/category.use-cases.js';
import { ItemUseCases } from '../../src/modules/master-data/application/item.use-cases.js';
import { PolicyUseCases } from '../../src/modules/master-data/application/policy.use-cases.js';
import { SupplierUseCases } from '../../src/modules/master-data/application/supplier.use-cases.js';
import { UnitUseCases } from '../../src/modules/master-data/application/unit.use-cases.js';
import { ItemType, TrackingMethod } from '../../src/modules/master-data/domain/master-data-rules.js';
import { MasterDataModule } from '../../src/modules/master-data/master-data.module.js';
import { OrganizationUseCases } from '../../src/modules/organization/application/organization.use-cases.js';
import { OrganizationModule } from '../../src/modules/organization/organization.module.js';
import { GoodsReceiptUseCases, SupplyUseCases } from '../../src/modules/supply/application/supply.use-cases.js';
import { SupplyModule } from '../../src/modules/supply/supply.module.js';
import { TransferUseCases } from '../../src/modules/transfers/application/transfer.use-cases.js';
import { TransfersModule } from '../../src/modules/transfers/transfers.module.js';
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
      TransfersModule,
    ],
  }).compile();
  await moduleRef.get(PrismaService).$connect();
  return moduleRef;
}

test('transfer dispatch/receive supports partial and damaged quantities', { skip: !runIntegration }, async () => {
  const auth = await bootstrapDirector();
  const moduleRef = await boot();
  const orgs = moduleRef.get(OrganizationUseCases);
  const categories = moduleRef.get(CategoryUseCases);
  const units = moduleRef.get(UnitUseCases);
  const policies = moduleRef.get(PolicyUseCases);
  const items = moduleRef.get(ItemUseCases);
  const suppliers = moduleRef.get(SupplierUseCases);
  const supplies = moduleRef.get(SupplyUseCases);
  const receipts = moduleRef.get(GoodsReceiptUseCases);
  const transfers = moduleRef.get(TransferUseCases);
  const inventory = moduleRef.get(InventoryQueryUseCases);
  const suffix = Date.now().toString().slice(-6);

  const destination = await orgs.createStoreWithDefaultWarehouse({
    organizationId: auth.organizationId,
    name: 'Dest',
    code: `DST${suffix}`,
  });
  const category = await categories.createCategory({ organizationId: auth.organizationId, name: 'Tr', code: `TR-${suffix}` });
  const unit = await units.createUnit({ organizationId: auth.organizationId, name: 'шт', symbol: `tr${suffix}`, quantityScale: 0 });
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
    name: 'Iris',
    code: `IR-${suffix}`,
    itemType: ItemType.FLOWER,
    isPurchasable: true,
  });
  const supplier = await suppliers.createSupplier({ organizationId: auth.organizationId, name: 'Grower', code: `TG-${suffix}` });

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
    receivedQuantity: '10',
    acceptedQuantity: '10',
    defectiveQuantity: '0',
    actualUnitPrice: '9',
  });
  await receipts.postGoodsReceipt({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    goodsReceiptId: receipt.id,
    idempotencyKey: `tr-rcpt-${suffix}`,
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
    requestedQuantity: '6',
  });
  const transferItem = withItem.items[0]!;

  const dispatched = await transfers.dispatch({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    transferId: transfer.id,
    expectedVersion: withItem.version,
    idempotencyKey: `tr-dispatch-${suffix}`,
    items: [{ transferItemId: transferItem.id, dispatchQuantity: '6' }],
  });
  assert.equal(dispatched.status, 'DISPATCHED');
  assert.equal(dispatched.allocations.length, 1);

  const allocation = dispatched.allocations[0]!;
  const received = await transfers.receive({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    transferId: transfer.id,
    expectedVersion: dispatched.version,
    idempotencyKey: `tr-receive-${suffix}`,
    allocations: [{
      transferAllocationId: allocation.id,
      transferItemId: allocation.transferItemId,
      itemId: item.id,
      receivedQuantity: '5',
      damagedQuantity: '1',
    }],
  });
  assert.equal(received.status, 'RECEIVED');

  const sourceBalances = await inventory.listBalances(auth.organizationId, auth.storeId, auth.warehouseId);
  const sourceBalance = sourceBalances.find((row) => row.itemId === item.id);
  assert.equal(sourceBalance?.onHandQuantity, '4');

  const destBalances = await inventory.listBalances(
    auth.organizationId,
    destination.store.id,
    destination.warehouse.id,
  );
  const destBalance = destBalances.find((row) => row.itemId === item.id);
  assert.equal(destBalance?.onHandQuantity, '5');

  await moduleRef.get(PrismaService).$disconnect();
  await moduleRef.close();
});
