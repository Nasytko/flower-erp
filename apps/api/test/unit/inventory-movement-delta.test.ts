import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import { signedMovementDelta } from '../../src/modules/inventory/domain/inventory-movement-delta.js';

test('signedMovementDelta applies direction by movement type', () => {
  const qty = new Prisma.Decimal('5');
  assert.equal(signedMovementDelta('RECEIPT', qty).toString(), '5');
  assert.equal(signedMovementDelta('ISSUE', qty).toString(), '-5');
  assert.equal(signedMovementDelta('WRITE_OFF', qty).toString(), '-5');
  assert.equal(signedMovementDelta('WRITE_OFF_REVERSAL', qty).toString(), '5');
  assert.equal(signedMovementDelta('COUNT_ADJUSTMENT_IN', qty).toString(), '5');
  assert.equal(signedMovementDelta('COUNT_ADJUSTMENT_OUT', qty).toString(), '-5');
  assert.equal(signedMovementDelta('RECEIPT_REVERSAL', qty).toString(), '-5');
  assert.equal(signedMovementDelta('ISSUE_REVERSAL', qty).toString(), '5');
});
