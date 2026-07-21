import assert from 'node:assert/strict';
import test from 'node:test';
import {
  OrderStatus,
  assertCanAssign,
  assertCanConfirm,
  assertCanReserve,
  assertCanStartPreparation,
  assertDraftEditable,
  assertQuantityPositive,
  claimNextPriorityBucket,
  isClaimEligibleStatus,
  isEligibleForClaimNext,
  statusFromReservationOutcome,
} from '../../src/modules/orders/domain/order-rules.js';

test('draft editable and confirm guards', () => {
  assert.doesNotThrow(() => assertDraftEditable(OrderStatus.DRAFT));
  assert.throws(() => assertDraftEditable(OrderStatus.CONFIRMED));
  assert.doesNotThrow(() => assertCanConfirm(OrderStatus.DRAFT, 1));
  assert.throws(() => assertCanConfirm(OrderStatus.DRAFT, 0));
});

test('reservation outcome maps to status', () => {
  assert.equal(statusFromReservationOutcome('FULL'), OrderStatus.RESERVED);
  assert.equal(statusFromReservationOutcome('PARTIAL'), OrderStatus.PARTIALLY_RESERVED);
  assert.equal(statusFromReservationOutcome('NONE'), OrderStatus.CONFIRMED);
});

test('reserve assign and prep guards', () => {
  assert.doesNotThrow(() => assertCanReserve(OrderStatus.PARTIALLY_RESERVED));
  assert.throws(() => assertCanReserve(OrderStatus.DRAFT));
  assert.doesNotThrow(() => assertCanAssign(OrderStatus.RESERVED));
  assert.throws(() => assertCanAssign(OrderStatus.DRAFT));
  assert.doesNotThrow(() => assertCanStartPreparation(OrderStatus.RESERVED, true));
  assert.throws(() => assertCanStartPreparation(OrderStatus.RESERVED, false));
  assert.throws(() => assertCanStartPreparation(OrderStatus.CONFIRMED, true));
});

test('quantity positive', () => {
  assert.doesNotThrow(() => assertQuantityPositive('1'));
  assert.throws(() => assertQuantityPositive('0'));
});

test('claimNext eligibility excludes terminal and assigned', () => {
  assert.equal(isClaimEligibleStatus(OrderStatus.RESERVED), true);
  assert.equal(isClaimEligibleStatus(OrderStatus.READY), false);
  assert.equal(isClaimEligibleStatus(OrderStatus.CANCELLED), false);
  assert.equal(isClaimEligibleStatus(OrderStatus.DRAFT), false);

  assert.equal(
    isEligibleForClaimNext({
      status: OrderStatus.RESERVED,
      storeId: 's1',
      targetStoreId: 's1',
      activeAssigneeMembershipId: null,
    }),
    true,
  );
  assert.equal(
    isEligibleForClaimNext({
      status: OrderStatus.IN_PREPARATION,
      storeId: 's1',
      targetStoreId: 's1',
      activeAssigneeMembershipId: 'other',
    }),
    false,
  );
  assert.equal(
    isEligibleForClaimNext({
      status: OrderStatus.RESERVED,
      storeId: 's1',
      targetStoreId: 's2',
      activeAssigneeMembershipId: null,
    }),
    false,
  );
  assert.equal(
    isEligibleForClaimNext({
      status: OrderStatus.READY,
      storeId: 's1',
      targetStoreId: 's1',
      activeAssigneeMembershipId: null,
    }),
    false,
  );
});

test('claimNext priority buckets', () => {
  const now = new Date('2026-07-16T12:00:00.000Z');
  assert.equal(
    claimNextPriorityBucket(OrderStatus.RESERVED, new Date('2026-07-16T11:00:00.000Z'), now, 30),
    0,
  );
  assert.equal(
    claimNextPriorityBucket(OrderStatus.RESERVED, new Date('2026-07-16T12:20:00.000Z'), now, 30),
    1,
  );
  assert.equal(claimNextPriorityBucket(OrderStatus.IN_PREPARATION, null, now, 30), 2);
});
