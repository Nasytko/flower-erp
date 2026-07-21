import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import { signedMovementDelta } from '../../src/modules/inventory/domain/inventory-movement-delta.js';
import {
  reconcileCountWithMovements,
  weightedAverageUnitCost,
} from '../../src/modules/inventory/domain/inventory-operations-rules.js';

test('signedMovementDelta applies direction by movement type', () => {
  const qty = new Prisma.Decimal('5');
  assert.equal(signedMovementDelta('RECEIPT', qty).toString(), '5');
  assert.equal(signedMovementDelta('WRITE_OFF', qty).toString(), '-5');
  assert.equal(signedMovementDelta('TRANSFER_IN', qty).toString(), '5');
  assert.equal(signedMovementDelta('TRANSFER_OUT', qty).toString(), '-5');
});

test('reconcileCountWithMovements includes post-cutoff movements', () => {
  const result = reconcileCountWithMovements('10', '-2', '8');
  assert.equal(result.varianceQuantity, '0.000');
  assert.equal(result.movementType, null);
});

test('weightedAverageUnitCost rejects zero-stock positive adjustment', () => {
  assert.throws(
    () => weightedAverageUnitCost([]),
    (error: unknown) => (error as { code?: string }).code === 'ZERO_COST_ADJUSTMENT_NOT_ALLOWED',
  );
});

test('weightedAverageUnitCost computes blended cost', () => {
  const cost = weightedAverageUnitCost([
    { remainingQuantity: '4', unitCost: '10' },
    { remainingQuantity: '6', unitCost: '20' },
  ]);
  assert.equal(cost, '16.0000');
});
