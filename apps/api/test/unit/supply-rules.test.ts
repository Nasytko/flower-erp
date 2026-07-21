import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SupplyStatus,
  assertReceiptLine,
  canAnnul,
  canCreateReceipt,
  canEditSupplyItems,
  canSubmit,
  recalculateSupplyStatus,
} from '../../src/modules/supply/domain/supply-rules.js';
import { DomainError } from '../../src/modules/master-data/domain/master-data-rules.js';

test('supply transitions enforce draft and receipt eligibility', () => {
  assert.doesNotThrow(() => canEditSupplyItems(SupplyStatus.DRAFT));
  assert.throws(() => canEditSupplyItems(SupplyStatus.SUBMITTED_TO_SUPPLIER), (error: unknown) => error instanceof DomainError);
  assert.throws(() => canSubmit(SupplyStatus.DRAFT, 0), (error: unknown) => error instanceof DomainError && error.code === 'SUPPLY_HAS_NO_ITEMS');
  assert.doesNotThrow(() => canSubmit(SupplyStatus.DRAFT, 1));
  assert.doesNotThrow(() => canAnnul(SupplyStatus.DRAFT));
  assert.doesNotThrow(() => canCreateReceipt(SupplyStatus.PARTIALLY_RECEIVED));
  assert.throws(() => canCreateReceipt(SupplyStatus.RECEIVED), (error: unknown) => error instanceof DomainError);
});

test('receipt line equation and status recalculation', () => {
  assert.doesNotThrow(() => assertReceiptLine('10', '8', '2'));
  assert.throws(() => assertReceiptLine('10', '8', '3'), (error: unknown) => error instanceof DomainError && error.code === 'RECEIPT_QUANTITY_MISMATCH');
  assert.equal(recalculateSupplyStatus('10', '0'), SupplyStatus.SUBMITTED_TO_SUPPLIER);
  assert.equal(recalculateSupplyStatus('10', '4'), SupplyStatus.PARTIALLY_RECEIVED);
  assert.equal(recalculateSupplyStatus('10', '10'), SupplyStatus.RECEIVED);
});
