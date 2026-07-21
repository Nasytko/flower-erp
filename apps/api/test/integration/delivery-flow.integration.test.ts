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
import { DeliveryModule } from '../../src/modules/delivery/delivery.module.js';
import { OrderUseCases } from '../../src/modules/orders/application/order.use-cases.js';
import { DeliveryUseCases } from '../../src/modules/delivery/application/delivery.use-cases.js';
import {
  DeliveryMethod,
  DeliveryStatus,
} from '../../src/modules/delivery/domain/delivery-rules.js';
import { OrderType } from '../../src/modules/orders/domain/order-rules.js';
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
      DeliveryModule,
    ],
  }).compile();
  await moduleRef.get(PrismaService).$connect();
  return moduleRef;
}

test('delivery flow: create, reject duplicate active, assign, deliver idempotent', {
  skip: !runIntegration,
}, async () => {
  const auth = await bootstrapDirector();
  const moduleRef = await boot();
  const orders = moduleRef.get(OrderUseCases);
  const deliveries = moduleRef.get(DeliveryUseCases);
  const prisma = moduleRef.get(PrismaService);
  const suffix = Date.now().toString().slice(-6);

  const order = await orders.createOrder({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    warehouseId: auth.warehouseId,
    type: OrderType.DELIVERY,
    recipientName: 'Anna',
    recipientPhone: '+375291112233',
    plannedPrice: '100.00',
  });

  const windowStart = new Date();
  windowStart.setHours(windowStart.getHours() + 2);
  const windowEnd = new Date(windowStart.getTime() + 60 * 60 * 1000);

  const job = await deliveries.createDeliveryFromOrder({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    orderId: order.id,
    method: DeliveryMethod.OWN_COURIER,
    deliveryDate: windowStart.toISOString().slice(0, 10),
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    addressLine: 'Nezavisimosti 1',
    city: 'Minsk',
    deliveryFee: '10.00',
  });
  assert.equal(job.status, DeliveryStatus.DRAFT);

  await assert.rejects(
    () =>
      deliveries.createDeliveryFromOrder({
        organizationId: auth.organizationId,
        storeId: auth.storeId,
        orderId: order.id,
        method: DeliveryMethod.OWN_COURIER,
        deliveryDate: windowStart.toISOString().slice(0, 10),
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
        addressLine: 'Nezavisimosti 1',
        city: 'Minsk',
      }),
    (err: { response?: { code?: string }; code?: string }) =>
      (err.response?.code ?? err.code) === 'ACTIVE_DELIVERY_EXISTS' ||
      String(err).includes('ACTIVE_DELIVERY_EXISTS'),
  );

  const planned = await deliveries.planDelivery({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    deliveryId: job.id,
    expectedVersion: job.version,
  });
  assert.equal(planned.status, DeliveryStatus.PLANNED);

  const membership = await prisma.organizationMembership.findFirst({
    where: { organizationId: auth.organizationId },
    select: { id: true },
  });
  assert.ok(membership);

  const courier = await deliveries.createCourier({
    organizationId: auth.organizationId,
    membershipId: membership.id,
    displayNameSnapshot: `Courier ${suffix}`,
  });

  const [a1, a2] = await Promise.allSettled([
    deliveries.assignCourier({
      organizationId: auth.organizationId,
      storeId: auth.storeId,
      deliveryId: planned.id,
      courierProfileId: courier.id,
      expectedVersion: planned.version,
    }),
    deliveries.assignCourier({
      organizationId: auth.organizationId,
      storeId: auth.storeId,
      deliveryId: planned.id,
      courierProfileId: courier.id,
      expectedVersion: planned.version,
    }),
  ]);
  const successes = [a1, a2].filter((r) => r.status === 'fulfilled');
  const failures = [a1, a2].filter((r) => r.status === 'rejected');
  assert.equal(successes.length, 1);
  assert.equal(failures.length, 1);

  const assigned = (successes[0] as PromiseFulfilledResult<{ id: string; version: number; status: string }>).value;

  // Force path to deliver: mark order ready + transit
  await orders.confirmOrder({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    orderId: order.id,
  }).catch(() => undefined);

  // Skip full prep — set status READY via prisma for readiness (port path)
  await prisma.order.update({
    where: { id: order.id },
    data: { status: 'READY' },
  });
  await deliveries.onOrderMarkedReady(auth.organizationId, auth.storeId, order.id);

  const readyJob = await deliveries.getDelivery(
    auth.organizationId,
    auth.storeId,
    assigned.id,
  );
  assert.equal(readyJob.status, DeliveryStatus.READY_FOR_DISPATCH);

  const transit = await deliveries.startTransit({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    deliveryId: readyJob.id,
    expectedVersion: readyJob.version,
  });
  assert.equal(transit.status, DeliveryStatus.IN_TRANSIT);

  const delivered = await deliveries.markDelivered({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    deliveryId: transit.id,
    expectedVersion: transit.version,
    idempotencyKey: `deliver-${transit.id}`,
  });
  assert.equal(delivered.status, DeliveryStatus.DELIVERED);

  const replay = await deliveries.markDelivered({
    organizationId: auth.organizationId,
    storeId: auth.storeId,
    deliveryId: transit.id,
    expectedVersion: delivered.version,
    idempotencyKey: `deliver-${transit.id}`,
  });
  assert.equal(replay.id, delivered.id);
  assert.equal(replay.status, DeliveryStatus.DELIVERED);

  await moduleRef.close();
});
