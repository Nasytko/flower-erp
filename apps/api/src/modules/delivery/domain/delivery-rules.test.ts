import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CourierStatus,
  DeliveryMethod,
  DeliveryStatus,
  assertCanAssign,
  assertCanDeliver,
  assertCanMarkReadyForDispatch,
  assertCanStartTransit,
  assertDeliveryFeeNonNegative,
  assertFulfillmentSwitchToPickupAllowed,
  assertTimeWindowValid,
  buildDisplayAddress,
  computeDeliveryUrgency,
  computeRequiredDispatchAt,
  statusAfterAssign,
} from './delivery-rules.js';

test('time window and fee validation', () => {
  const start = new Date('2026-07-17T10:00:00Z');
  const end = new Date('2026-07-17T12:00:00Z');
  assert.doesNotThrow(() => assertTimeWindowValid(start, end));
  assert.throws(() => assertTimeWindowValid(end, start));
  assert.doesNotThrow(() => assertDeliveryFeeNonNegative('0.00'));
  assert.doesNotThrow(() => assertDeliveryFeeNonNegative('12.50'));
  assert.throws(() => assertDeliveryFeeNonNegative('-1'));
});

test('computeRequiredDispatchAt subtracts buffer', () => {
  const windowStart = new Date('2026-07-17T14:00:00Z');
  const dispatchAt = computeRequiredDispatchAt(windowStart, 30);
  assert.equal(dispatchAt.toISOString(), '2026-07-17T13:30:00.000Z');
});

test('urgency NORMAL SOON URGENT OVERDUE', () => {
  const windowStart = new Date('2026-07-17T14:00:00Z');
  const soonMinutes = 45;
  assert.equal(
    computeDeliveryUrgency({
      status: DeliveryStatus.PLANNED,
      windowStart,
      requiredDispatchAt: null,
      serverNow: new Date('2026-07-17T10:00:00Z'),
      soonMinutes,
    }),
    'NORMAL',
  );
  assert.equal(
    computeDeliveryUrgency({
      status: DeliveryStatus.PLANNED,
      windowStart,
      requiredDispatchAt: null,
      serverNow: new Date('2026-07-17T13:30:00Z'),
      soonMinutes,
    }),
    'SOON',
  );
  assert.equal(
    computeDeliveryUrgency({
      status: DeliveryStatus.PLANNED,
      windowStart,
      requiredDispatchAt: null,
      serverNow: new Date('2026-07-17T13:50:00Z'),
      soonMinutes,
    }),
    'URGENT',
  );
  assert.equal(
    computeDeliveryUrgency({
      status: DeliveryStatus.ASSIGNED,
      windowStart,
      requiredDispatchAt: new Date('2026-07-17T13:00:00Z'),
      serverNow: new Date('2026-07-17T13:05:00Z'),
      soonMinutes,
    }),
    'OVERDUE',
  );
  assert.equal(
    computeDeliveryUrgency({
      status: DeliveryStatus.DELIVERED,
      windowStart,
      requiredDispatchAt: null,
      serverNow: new Date('2026-07-17T15:00:00Z'),
      soonMinutes,
    }),
    'NORMAL',
  );
});

test('assertCanAssign guards', () => {
  assert.doesNotThrow(() =>
    assertCanAssign({
      status: DeliveryStatus.PLANNED,
      courierStatus: CourierStatus.ACTIVE,
      courierOrganizationId: 'org',
      deliveryOrganizationId: 'org',
    }),
  );
  assert.throws(() =>
    assertCanAssign({
      status: DeliveryStatus.DELIVERED,
      courierStatus: CourierStatus.ACTIVE,
      courierOrganizationId: 'org',
      deliveryOrganizationId: 'org',
    }),
  );
  assert.throws(() =>
    assertCanAssign({
      status: DeliveryStatus.PLANNED,
      courierStatus: CourierStatus.ARCHIVED,
      courierOrganizationId: 'org',
      deliveryOrganizationId: 'org',
    }),
  );
  assert.throws(() =>
    assertCanAssign({
      status: DeliveryStatus.PLANNED,
      courierStatus: CourierStatus.ACTIVE,
      courierOrganizationId: 'other',
      deliveryOrganizationId: 'org',
    }),
  );
});

test('ready / transit / deliver transitions', () => {
  assert.throws(() => assertCanMarkReadyForDispatch(DeliveryStatus.PLANNED, false));
  assert.doesNotThrow(() => assertCanMarkReadyForDispatch(DeliveryStatus.PLANNED, true));
  assert.doesNotThrow(() =>
    assertCanStartTransit({
      status: DeliveryStatus.ASSIGNED,
      method: DeliveryMethod.OWN_COURIER,
      hasActiveAssignment: true,
      hasExternalReference: false,
    }),
  );
  assert.throws(() =>
    assertCanStartTransit({
      status: DeliveryStatus.ASSIGNED,
      method: DeliveryMethod.OWN_COURIER,
      hasActiveAssignment: false,
      hasExternalReference: false,
    }),
  );
  assert.doesNotThrow(() => assertCanDeliver(DeliveryStatus.IN_TRANSIT));
  assert.throws(() => assertCanDeliver(DeliveryStatus.PLANNED));
});

test('fulfillment switch and display address', () => {
  assert.doesNotThrow(() =>
    assertFulfillmentSwitchToPickupAllowed({
      status: DeliveryStatus.PLANNED,
      handedOverAt: null,
    }),
  );
  assert.throws(() =>
    assertFulfillmentSwitchToPickupAllowed({
      status: DeliveryStatus.ASSIGNED,
      handedOverAt: new Date(),
    }),
  );
  assert.equal(
    buildDisplayAddress({ addressLine: 'Lenina 1', city: 'Minsk', apartment: '12' }),
    'Lenina 1, Minsk, apt. 12',
  );
  assert.equal(statusAfterAssign(DeliveryStatus.PLANNED), DeliveryStatus.ASSIGNED);
  assert.equal(statusAfterAssign(DeliveryStatus.READY_FOR_DISPATCH), DeliveryStatus.READY_FOR_DISPATCH);
});
