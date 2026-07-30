import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAvailableStockMap,
  computeReservedShortages,
  computeStockShortages,
} from './order-composition-stock';

test('computeStockShortages flags items below available quantity', () => {
  const stock = buildAvailableStockMap([
    { itemId: 'rose', availableQuantity: '3' },
    { itemId: 'wrap', availableQuantity: '10' },
  ]);
  const shortages = computeStockShortages(
    [
      { itemId: 'rose', name: 'Роза', quantity: '5' },
      { itemId: 'wrap', name: 'Упаковка', quantity: '2' },
    ],
    stock,
  );
  assert.equal(shortages.length, 1);
  assert.equal(shortages[0]?.itemId, 'rose');
  assert.equal(shortages[0]?.missing, '2');
});

test('computeReservedShortages uses deficit from reserved composition', () => {
  const shortages = computeReservedShortages([
    {
      itemId: 'rose',
      plannedQuantity: '5',
      deficitQuantity: '2',
      item: { name: 'Роза' },
    },
  ]);
  assert.equal(shortages.length, 1);
  assert.equal(shortages[0]?.missing, '2');
});
