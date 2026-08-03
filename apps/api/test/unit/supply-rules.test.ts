import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SupplyStatus,
  assertReceiptLine,
  canAnnul,
  canCreateReceipt,
  canEditSupplyHeader,
  canEditSupplyItems,
  canMarkSupplyPaid,
  canReceiveSupply,
  canSubmit,
  isOpenSupply,
  recalculateSupplyStatus,
} from '../../src/modules/supply/domain/supply-rules.js';
import { DomainError } from '../../src/modules/master-data/domain/master-data-rules.js';

test('open supplies stay editable before posting', () => {
  assert.equal(isOpenSupply(SupplyStatus.DRAFT), true);
  assert.equal(isOpenSupply(SupplyStatus.SUBMITTED_TO_SUPPLIER), true);
  assert.equal(isOpenSupply(SupplyStatus.RECEIVED), false);

  assert.doesNotThrow(() => canEditSupplyItems(SupplyStatus.DRAFT));
  assert.doesNotThrow(() => canEditSupplyItems(SupplyStatus.SUBMITTED_TO_SUPPLIER));
  assert.doesNotThrow(() => canEditSupplyHeader(SupplyStatus.SUBMITTED_TO_SUPPLIER));
  assert.throws(() => canEditSupplyItems(SupplyStatus.RECEIVED), (error: unknown) => error instanceof DomainError);
});

test('supply transitions enforce items and receipt eligibility', () => {
  assert.throws(() => canSubmit(SupplyStatus.DRAFT, 0), (error: unknown) => error instanceof DomainError && error.code === 'SUPPLY_HAS_NO_ITEMS');
  assert.doesNotThrow(() => canSubmit(SupplyStatus.DRAFT, 1));
  assert.doesNotThrow(() => canSubmit(SupplyStatus.SUBMITTED_TO_SUPPLIER, 1));
  assert.doesNotThrow(() => canReceiveSupply(SupplyStatus.SUBMITTED_TO_SUPPLIER, 2));
  assert.doesNotThrow(() => canAnnul(SupplyStatus.SUBMITTED_TO_SUPPLIER));
  assert.throws(() => canAnnul(SupplyStatus.RECEIVED), (error: unknown) => error instanceof DomainError);
  assert.doesNotThrow(() => canCreateReceipt(SupplyStatus.PARTIALLY_RECEIVED));
  assert.throws(() => canCreateReceipt(SupplyStatus.RECEIVED), (error: unknown) => error instanceof DomainError);
});

test('supply payment can be recorded for submitted or received supplies', () => {
  assert.doesNotThrow(() => canMarkSupplyPaid(SupplyStatus.SUBMITTED_TO_SUPPLIER));
  assert.doesNotThrow(() => canMarkSupplyPaid(SupplyStatus.PARTIALLY_RECEIVED));
  assert.doesNotThrow(() => canMarkSupplyPaid(SupplyStatus.RECEIVED));
  assert.throws(
    () => canMarkSupplyPaid(SupplyStatus.DRAFT),
    (error: unknown) => error instanceof DomainError && error.code === 'SUPPLY_PAYMENT_NOT_APPLICABLE',
  );
  assert.throws(
    () => canMarkSupplyPaid(SupplyStatus.ANNULLED),
    (error: unknown) => error instanceof DomainError,
  );
});

test('receipt line equation and status recalculation', () => {
  assert.doesNotThrow(() => assertReceiptLine('10', '8', '2'));
  assert.throws(() => assertReceiptLine('10', '8', '3'), (error: unknown) => error instanceof DomainError && error.code === 'RECEIPT_QUANTITY_MISMATCH');
  assert.equal(recalculateSupplyStatus('10', '0'), SupplyStatus.SUBMITTED_TO_SUPPLIER);
  assert.equal(recalculateSupplyStatus('10', '4'), SupplyStatus.PARTIALLY_RECEIVED);
  assert.equal(recalculateSupplyStatus('10', '10'), SupplyStatus.RECEIVED);
});
