import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveOrderBoardStockHint } from '../../src/modules/orders/domain/order-board-stock.js';

test('resolveOrderBoardStockHint previews shortage for CONFIRMED from free stock', () => {
  const result = resolveOrderBoardStockHint({
    status: 'CONFIRMED',
    lines: [
      {
        compositionItemId: 'line-1',
        itemId: 'rose',
        itemName: 'Роза',
        plannedQuantity: '5',
      },
    ],
    reservedByCompositionItemId: new Map(),
    availableByItemId: new Map([['rose', '2']]),
  });
  assert.equal(result.hasStockDeficit, true);
  assert.equal(result.stockShortageHint, 'Роза ×3');
});

test('resolveOrderBoardStockHint uses reservation deficit after reserve', () => {
  const result = resolveOrderBoardStockHint({
    status: 'PARTIALLY_RESERVED',
    lines: [
      {
        compositionItemId: 'line-1',
        itemId: 'rose',
        itemName: 'Роза',
        plannedQuantity: '5',
      },
    ],
    reservedByCompositionItemId: new Map([['line-1', '3']]),
    availableByItemId: new Map([['rose', '10']]),
  });
  assert.equal(result.hasStockDeficit, true);
  assert.equal(result.stockShortageHint, 'Роза ×2');
});

test('resolveOrderBoardStockHint is clear when stock covers plan', () => {
  const result = resolveOrderBoardStockHint({
    status: 'CONFIRMED',
    lines: [
      {
        compositionItemId: 'line-1',
        itemId: 'rose',
        itemName: 'Роза',
        plannedQuantity: '3',
      },
    ],
    reservedByCompositionItemId: new Map(),
    availableByItemId: new Map([['rose', '5']]),
  });
  assert.equal(result.hasStockDeficit, false);
  assert.equal(result.stockShortageHint, null);
});
