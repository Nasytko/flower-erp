import assert from 'node:assert/strict';
import test from 'node:test';
import {
  matchesOrderListFilter,
  orderPhaseLabel,
  resolveOrderPhase,
} from './order-ui';

test('resolveOrderPhase maps legacy draft to new queue', () => {
  assert.equal(resolveOrderPhase({ status: 'DRAFT' }), 'NEW');
  assert.equal(resolveOrderPhase({ status: 'CONFIRMED' }), 'NEW');
  assert.equal(
    resolveOrderPhase({ status: 'RESERVED', hasActiveAssignment: true }),
    'IN_WORK',
  );
});

test('prefers API displayPhase when provided', () => {
  assert.equal(
    resolveOrderPhase({ status: 'CONFIRMED', displayPhase: 'IN_WORK' }),
    'IN_WORK',
  );
});

test('handed off today filter', () => {
  const today = new Date().toISOString();
  const yesterday = new Date(Date.now() - 86_400_000).toISOString();
  assert.equal(
    matchesOrderListFilter(
      { status: 'COMPLETED', completedAt: today },
      null,
      'HANDED_OFF_TODAY',
    ),
    true,
  );
  assert.equal(
    matchesOrderListFilter(
      { status: 'COMPLETED', completedAt: yesterday },
      null,
      'HANDED_OFF_TODAY',
    ),
    false,
  );
});

test('orderPhaseLabel for handed off by type', () => {
  assert.equal(orderPhaseLabel('HANDED_OFF', { type: 'DELIVERY' }), 'Передан (доставка)');
  assert.equal(orderPhaseLabel('NEW'), 'Новый');
});
