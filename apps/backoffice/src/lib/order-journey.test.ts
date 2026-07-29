import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildOrderJourney,
  buildJourneyStrip,
  journeyNextAction,
  pickLinkedSale,
} from './order-journey';

const base = '/organizations/o1/stores/s1';

test('pickLinkedSale prefers completed sale', () => {
  const picked = pickLinkedSale([
    { id: '1', number: 'S1', status: 'DRAFT' },
    { id: '2', number: 'S2', status: 'COMPLETED' },
  ]);
  assert.equal(picked?.id, '2');
});

test('buildOrderJourney includes delivery branch for delivery orders', () => {
  const branches = buildOrderJourney({
    basePath: base,
    order: {
      id: 'ord1',
      number: 'Z-1',
      type: 'DELIVERY',
      status: 'READY',
    },
    delivery: { id: 'd1', number: 'D-1', status: 'IN_TRANSIT' },
    sale: null,
  });
  assert.equal(branches.length, 3);
  const delivery = branches.find((b) => b.id === 'delivery');
  assert.ok(delivery?.isCurrent);
});

test('buildOrderJourney skips delivery for pickup', () => {
  const branches = buildOrderJourney({
    basePath: base,
    order: {
      id: 'ord1',
      number: 'Z-1',
      type: 'PICKUP',
      status: 'READY',
    },
    delivery: null,
    sale: null,
  });
  assert.equal(branches.length, 2);
  assert.ok(!branches.some((b) => b.id === 'delivery'));
});

test('only one branch is current at a time', () => {
  const branches = buildOrderJourney({
    basePath: base,
    order: {
      id: 'ord1',
      number: 'Z-1',
      type: 'DELIVERY',
      status: 'IN_PREPARATION',
      hasActiveAssignment: true,
    },
    delivery: { id: 'd1', number: 'D-1', status: 'PLANNED' },
    sale: null,
  });
  assert.equal(branches.filter((b) => b.isCurrent).length, 1);
  assert.equal(branches.find((b) => b.isCurrent)?.id, 'order');
});

test('ready delivery order highlights delivery branch', () => {
  const branches = buildOrderJourney({
    basePath: base,
    order: {
      id: 'ord1',
      number: 'Z-1',
      type: 'DELIVERY',
      status: 'READY',
    },
    delivery: { id: 'd1', number: 'D-1', status: 'READY_FOR_DISPATCH' },
    sale: null,
  });
  assert.equal(branches.find((b) => b.isCurrent)?.id, 'delivery');
});

test('journeyNextAction suggests delivery when bouquet ready', () => {
  const next = journeyNextAction({
    basePath: base,
    order: {
      id: 'ord1',
      number: 'Z-1',
      type: 'DELIVERY',
      status: 'READY',
    },
    delivery: { id: 'd1', number: 'D-1', status: 'READY_FOR_DISPATCH' },
    sale: null,
  });
  assert.equal(next?.branchId, 'delivery');
  assert.match(next?.href ?? '', /deliveries\/d1/);
});

test('buildJourneyStrip returns ordered nodes', () => {
  const strip = buildJourneyStrip({
    basePath: base,
    order: { id: '1', number: 'Z-1', type: 'DELIVERY', status: 'READY' },
    delivery: { id: 'd1', number: 'D-1', status: 'IN_TRANSIT' },
    sale: null,
  });
  assert.deepEqual(
    strip.map((n) => n.id),
    ['order', 'delivery', 'sale'],
  );
});
