import assert from 'node:assert/strict';
import test from 'node:test';
import { InventoryOperationRuleError, assertWriteOffLine } from './inventory-operations-rules.js';

test('write-off quantity must be positive', () => {
  assert.throws(
    () => assertWriteOffLine('0'),
    (error: unknown) =>
      error instanceof InventoryOperationRuleError && error.code === 'INVALID_WRITE_OFF_QUANTITY',
  );
});
