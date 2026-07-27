import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOrderListPhaseWhere } from '../../src/modules/orders/domain/order-list-phase-filter.js';

const now = new Date('2026-07-27T12:00:00.000Z');

test('buildOrderListPhaseWhere maps NEW to unassigned open statuses', () => {
  const where = buildOrderListPhaseWhere({ phase: 'NEW', now });
  assert.deepEqual(where, {
    status: { in: ['CONFIRMED', 'PARTIALLY_RESERVED', 'RESERVED'] },
    assignments: { none: { releasedAt: null } },
  });
});

test('buildOrderListPhaseWhere HANDED_OFF_TODAY includes delivered orders', () => {
  const where = buildOrderListPhaseWhere({
    phase: 'HANDED_OFF_TODAY',
    now,
    deliveredTodayOrderIds: ['order-1'],
  });
  assert.equal(Array.isArray(where.OR), true);
  assert.equal((where.OR as unknown[]).length, 2);
});

test('buildOrderListPhaseWhere READY excludes delivered orders', () => {
  const where = buildOrderListPhaseWhere({
    phase: 'READY',
    now,
    deliveredOrderIds: ['order-1'],
  });
  assert.deepEqual(where, {
    status: 'READY',
    id: { notIn: ['order-1'] },
  });
});
