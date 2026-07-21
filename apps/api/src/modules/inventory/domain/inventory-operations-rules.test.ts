import assert from 'node:assert/strict';
import test from 'node:test';
import {
  InventoryOperationRuleError,
  assertTransferDispatch,
  assertTransferReceipt,
  assertWriteOffLine,
  reconcileCount,
} from './inventory-operations-rules.js';

test('write-off quantity must be positive', () => {
  assert.throws(
    () => assertWriteOffLine('0'),
    (error: unknown) =>
      error instanceof InventoryOperationRuleError && error.code === 'INVALID_WRITE_OFF_QUANTITY',
  );
});

test('count reconcile returns inbound adjustment', () => {
  const result = reconcileCount('4.000', '6.000');
  assert.equal(result.varianceQuantity, '2.000');
  assert.equal(result.movementType, 'COUNT_ADJUSTMENT_IN');
});

test('count reconcile returns outbound adjustment', () => {
  const result = reconcileCount('6.000', '4.000');
  assert.equal(result.varianceQuantity, '-2.000');
  assert.equal(result.movementType, 'COUNT_ADJUSTMENT_OUT');
});

test('dispatch cannot exceed requested', () => {
  assert.throws(
    () => assertTransferDispatch('2.000', '3.000'),
    (error: unknown) =>
      error instanceof InventoryOperationRuleError && error.code === 'DISPATCH_EXCEEDS_REQUESTED',
  );
});

test('receipt plus damage cannot exceed dispatched', () => {
  assert.throws(
    () => assertTransferReceipt('5.000', '4.000', '2.000'),
    (error: unknown) =>
      error instanceof InventoryOperationRuleError && error.code === 'RECEIPT_EXCEEDS_DISPATCHED',
  );
});
