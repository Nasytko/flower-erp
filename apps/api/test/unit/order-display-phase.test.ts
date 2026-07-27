import assert from 'node:assert/strict';
import test from 'node:test';
import {
  orderDisplayPhaseLabel,
  resolveOrderDisplayPhase,
} from '../../src/modules/orders/domain/order-display-phase.js';

test('resolveOrderDisplayPhase distinguishes draft from new queue', () => {
  assert.equal(resolveOrderDisplayPhase({ status: 'DRAFT' }), 'DRAFT');
  assert.equal(resolveOrderDisplayPhase({ status: 'CONFIRMED' }), 'NEW');
  assert.equal(
    resolveOrderDisplayPhase({ status: 'RESERVED', hasActiveAssignment: true }),
    'IN_WORK',
  );
  assert.equal(resolveOrderDisplayPhase({ status: 'IN_PREPARATION' }), 'IN_WORK');
  assert.equal(resolveOrderDisplayPhase({ status: 'READY' }), 'READY');
  assert.equal(resolveOrderDisplayPhase({ status: 'COMPLETED', type: 'PICKUP' }), 'HANDED_OFF');
});

test('delivery delivered maps to handed off', () => {
  assert.equal(
    resolveOrderDisplayPhase(
      { status: 'READY', type: 'DELIVERY' },
      { status: 'DELIVERED', handedOverAt: null },
    ),
    'HANDED_OFF',
  );
});

test('orderDisplayPhaseLabel uses order type for handed off', () => {
  assert.equal(orderDisplayPhaseLabel('DRAFT'), 'Черновик');
  assert.equal(orderDisplayPhaseLabel('HANDED_OFF', { type: 'DELIVERY' }), 'Передан (доставка)');
  assert.equal(orderDisplayPhaseLabel('HANDED_OFF', { type: 'PICKUP' }), 'Передан (самовывоз)');
});
