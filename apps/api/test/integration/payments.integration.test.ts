import '../helpers/test-env.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service.js';
import { InfrastructureModule } from '../../src/infrastructure/infrastructure.module.js';
import { OrganizationModule } from '../../src/modules/organization/organization.module.js';
import { MasterDataModule } from '../../src/modules/master-data/master-data.module.js';
import { InventoryModule } from '../../src/modules/inventory/inventory.module.js';
import { OrdersModule } from '../../src/modules/orders/orders.module.js';
import { SalesModule } from '../../src/modules/sales/sales.module.js';
import { PaymentsModule } from '../../src/modules/payments/payments.module.js';
import { CustomerUseCases } from '../../src/modules/orders/application/customer.use-cases.js';
import { OrderUseCases } from '../../src/modules/orders/application/order.use-cases.js';
import { PaymentUseCases } from '../../src/modules/payments/application/payment.use-cases.js';
import { ItemUseCases } from '../../src/modules/master-data/application/item.use-cases.js';
import { CategoryUseCases } from '../../src/modules/master-data/application/category.use-cases.js';
import { UnitUseCases } from '../../src/modules/master-data/application/unit.use-cases.js';
import { PolicyUseCases } from '../../src/modules/master-data/application/policy.use-cases.js';
import { ItemType, TrackingMethod } from '../../src/modules/master-data/domain/master-data-rules.js';
import { PaymentStatusProjection } from '../../src/modules/payments/domain/payment-rules.js';
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
      OrdersModule,
      SalesModule,
      PaymentsModule,
    ],
  }).compile();
  await moduleRef.get(PrismaService).$connect();
  return moduleRef;
}

test('order prepayment complete posts cash and updates summary; idempotent', {
  skip: !runIntegration,
}, async () => {
  const auth = await bootstrapDirector();
  const moduleRef = await boot();
  const payments = moduleRef.get(PaymentUseCases);
  const orders = moduleRef.get(OrderUseCases);
  const customers = moduleRef.get(CustomerUseCases);
  const categories = moduleRef.get(CategoryUseCases);
  const units = moduleRef.get(UnitUseCases);
  const policies = moduleRef.get(PolicyUseCases);
  const itemsUc = moduleRef.get(ItemUseCases);
  const prisma = moduleRef.get(PrismaService);
  const suffix = Date.now().toString().slice(-6);

  const methods = await payments.ensureDefaultPaymentMethods(auth.organizationId);
  const cashMethod = methods.find((row) => row.code === 'CASH');
  assert.ok(cashMethod);

  const customer = await customers.createCustomer({
    organizationId: auth.organizationId,
    name: 'Pay Client',
    phone: `+37529${suffix}`,
  });
  const category = await categories.createCategory({
    organizationId: auth.organizationId,
    name: 'PayCat',
    code: `PC-${suffix}`,
  });
  const unit = await units.createUnit({
    organizationId: auth.organizationId,
    name: 'шт',
    symbol: `p${suffix.slice(-2)}`,
    quantityScale: 0,
  });
  const policy = await policies.createInventoryPolicy({
    organizationId: auth.organizationId,
    name: 'Mat',
    itemType: ItemType.MATERIAL,
    trackingMethod: TrackingMethod.NONE,
    expirationTracking: false,
  });
  const item = await itemsUc.createItem({
    organizationId: auth.organizationId,
    categoryId: category.id,
    unitId: unit.id,
    inventoryPolicyId: policy.id,
    name: 'Paper',
    code: `PP-${suffix}`,
    itemType: ItemType.MATERIAL,
    isPurchasable: true,
    isSellable: true,
  });

  const order = await orders.createOrder({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    warehouseId: auth.warehouseId,
    type: 'PICKUP',
    customerId: customer.id,
    occasion: 'BIRTHDAY',
    plannedPrice: '100.00',
  });
  await orders.addCompositionItem({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    orderId: order.id,
    itemId: item.id,
    plannedQuantity: '1',
  });
  await orders.confirmOrder({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    orderId: order.id,
  });

  const draft = await payments.createOrderPrepayment({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    orderId: order.id,
    methodId: cashMethod.id,
    amount: '40.00',
  });
  assert.equal(draft.status, 'DRAFT');

  const completed = await payments.completePayment({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    paymentId: draft.id,
    idempotencyKey: `pay-complete-${suffix}`,
  });
  assert.equal(completed.status, 'COMPLETED');

  const replay = await payments.completePayment({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    paymentId: draft.id,
    idempotencyKey: `pay-complete-${suffix}`,
  });
  assert.equal(replay.id, completed.id);

  const summary = await payments.getOrderPaymentSummary(
    auth.organizationId,
    auth.storeId,
    order.id,
  );
  assert.equal(summary.paidAmount, '40.00');
  assert.equal(summary.balanceDue, '60.00');
  assert.equal(summary.status, PaymentStatusProjection.PARTIALLY_PAID);

  const cashOps = await prisma.cashOperation.count({
    where: { organizationId: auth.organizationId, paymentId: draft.id },
  });
  assert.equal(cashOps, 1);

  await moduleRef.close();
});
