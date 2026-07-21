import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DiscountType,
  SaleStatus,
  applyDiscount,
  assertCanAnnul,
  assertCanComplete,
  assertDraft,
  computeGross,
  computeMargin,
  computeNet,
  validateDiscount,
} from '../../src/modules/sales/domain/sale-rules.js';

test('gross net discount and margin use decimal strings', () => {
  assert.equal(computeGross(['10.00', '5.50']), '15.50');
  assert.equal(applyDiscount(DiscountType.PERCENT, '10', '100.00'), '10.00');
  assert.equal(applyDiscount(DiscountType.FIXED, '3', '10.00'), '3.00');
  assert.equal(computeNet('100.00', '10.00'), '90.00');
  const margin = computeMargin('100.00', '40.00');
  assert.equal(margin.grossProfitAmount, '60.0000');
  assert.equal(margin.marginPercent, '60.0000');
  assert.equal(computeMargin('0.00', '0').marginPercent, null);
});

test('discount override threshold', () => {
  assert.doesNotThrow(() =>
    validateDiscount(DiscountType.PERCENT, '15', '100', 20, false),
  );
  assert.throws(() => validateDiscount(DiscountType.PERCENT, '25', '100', 20, false));
  assert.doesNotThrow(() => validateDiscount(DiscountType.PERCENT, '25', '100', 20, true));
});

test('status transitions', () => {
  assert.doesNotThrow(() => assertDraft(SaleStatus.DRAFT));
  assert.throws(() => assertDraft(SaleStatus.COMPLETED));
  assert.doesNotThrow(() => assertCanComplete(SaleStatus.DRAFT));
  assert.throws(() => assertCanComplete(SaleStatus.COMPLETED));
  assert.doesNotThrow(() => assertCanAnnul(SaleStatus.COMPLETED));
  assert.throws(() => assertCanAnnul(SaleStatus.DRAFT));
  assert.throws(() => assertCanAnnul(SaleStatus.ANNULLED));
});
