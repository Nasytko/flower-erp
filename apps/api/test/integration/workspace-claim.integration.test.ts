import '../helpers/test-env.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service.js';
import { InfrastructureModule } from '../../src/infrastructure/infrastructure.module.js';
import { OrganizationModule } from '../../src/modules/organization/organization.module.js';
import { MasterDataModule } from '../../src/modules/master-data/master-data.module.js';
import { InventoryModule } from '../../src/modules/inventory/inventory.module.js';
import { OrdersModule } from '../../src/modules/orders/orders.module.js';
import { OrderUseCases } from '../../src/modules/orders/application/order.use-cases.js';
import { CustomerUseCases } from '../../src/modules/orders/application/customer.use-cases.js';
import { ItemUseCases } from '../../src/modules/master-data/application/item.use-cases.js';
import { CategoryUseCases } from '../../src/modules/master-data/application/category.use-cases.js';
import { UnitUseCases } from '../../src/modules/master-data/application/unit.use-cases.js';
import { PolicyUseCases } from '../../src/modules/master-data/application/policy.use-cases.js';
import { ItemType, TrackingMethod } from '../../src/modules/master-data/domain/master-data-rules.js';
import { requestContextStorage } from '../../src/infrastructure/context/request-context.js';
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
    ],
  }).compile();
  await moduleRef.get(PrismaService).$connect();
  return moduleRef;
}

function withMembership<T>(
  membershipId: string,
  organizationId: string,
  userId: string,
  fn: () => Promise<T>,
): Promise<T> {
  return requestContextStorage.run(
    {
      requestId: 'claim-next-test',
      actorId: userId,
      organizationId,
      auth: {
        userId,
        membershipId,
        organizationId,
        sessionId: 'test-session',
        permissions: ['orders:assign', 'orders:prepare', 'workspace:read'],
        storeScope: { mode: 'ALL_STORES', storeIds: [] },
      },
    },
    fn,
  );
}

test('concurrent claimNext assigns distinct orders without double-claim', {
  skip: !runIntegration,
}, async () => {
  const auth = await bootstrapDirector();
  const moduleRef = await boot();
  const orders = moduleRef.get(OrderUseCases);
  const customers = moduleRef.get(CustomerUseCases);
  const categories = moduleRef.get(CategoryUseCases);
  const units = moduleRef.get(UnitUseCases);
  const policies = moduleRef.get(PolicyUseCases);
  const items = moduleRef.get(ItemUseCases);
  const prisma = moduleRef.get(PrismaService);
  const suffix = Date.now().toString().slice(-6);

  const membership = await prisma.organizationMembership.findFirst({
    where: { organizationId: auth.organizationId },
  });
  assert.ok(membership);

  // Second florist membership for concurrent claimer
  const floristUser = await prisma.user.create({
    data: {
      id: randomUUID(),
      login: `fl${suffix}`,
      passwordHash: 'x',
      displayName: 'Florist B',
      status: 'ACTIVE',
      passwordChangedAt: new Date(),
    },
  });
  const floristMembership = await prisma.organizationMembership.create({
    data: {
      id: randomUUID(),
      organizationId: auth.organizationId,
      userId: floristUser.id,
      status: 'ACTIVE',
    },
  });

  const category = await categories.createCategory({
    organizationId: auth.organizationId,
    name: 'WS',
    code: `WS-${suffix}`,
  });
  const unit = await units.createUnit({
    organizationId: auth.organizationId,
    name: 'шт',
    symbol: `w${suffix.slice(-2)}`,
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
    name: 'Paper',
    code: `WP-${suffix}`,
    itemType: ItemType.MATERIAL,
    isPurchasable: true,
  });
  const customer = await customers.createCustomer({
    organizationId: auth.organizationId,
    name: 'Client',
    phone: `+7920${suffix}`,
  });

  const readyAt = new Date(Date.now() + 60 * 60_000).toISOString();
  const createdIds: string[] = [];
  for (let i = 0; i < 2; i++) {
    const order = await orders.createOrder({
      organizationId: auth.organizationId,
      storeId: auth.storeId,
      warehouseId: auth.warehouseId,
      customerId: customer.id,
      readyAt,
    });
    await orders.addCompositionItem({
      organizationId: auth.organizationId,
      storeId: auth.storeId,
      orderId: order.id,
      itemId: item.id,
      quantity: '1',
    });
    const confirmed = await orders.confirmOrder({
      organizationId: auth.organizationId,
      storeId: auth.storeId,
      orderId: order.id,
    });
    assert.ok(
      ['CONFIRMED', 'PARTIALLY_RESERVED', 'RESERVED'].includes(confirmed.status as string),
    );
    createdIds.push(order.id);
  }

  const [resultA, resultB] = await Promise.all([
    withMembership(membership!.id, auth.organizationId, membership!.userId, () =>
      orders.claimNextOrder({
        organizationId: auth.organizationId,
        storeId: auth.storeId,
      }),
    ),
    withMembership(floristMembership.id, auth.organizationId, floristUser.id, () =>
      orders.claimNextOrder({
        organizationId: auth.organizationId,
        storeId: auth.storeId,
      }),
    ),
  ]);

  assert.equal(resultA.code, 'OK');
  assert.equal(resultB.code, 'OK');
  assert.ok(resultA.order);
  assert.ok(resultB.order);
  assert.notEqual(resultA.order!.id, resultB.order!.id);
  assert.ok(createdIds.includes(resultA.order!.id));
  assert.ok(createdIds.includes(resultB.order!.id));
  assert.equal(resultA.order!.assignedFloristId, membership!.id);
  assert.equal(resultB.order!.assignedFloristId, floristMembership.id);

  const empty = await withMembership(membership!.id, auth.organizationId, membership!.userId, () =>
    orders.claimNextOrder({
      organizationId: auth.organizationId,
      storeId: auth.storeId,
    }),
  );
  assert.equal(empty.code, 'NO_ORDER_AVAILABLE');
  assert.equal(empty.order, null);

  await prisma.$disconnect();
  await moduleRef.close();
});
