import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DomainError,
  PaymentStatus,
  PaymentStatusProjection,
  assertAllocationsEqualPayment,
  assertCanAnnul,
  assertCanComplete,
  assertNoOverpayment,
  assertOrderAcceptsPrepayment,
  assertRefundWithinLimit,
  assertSaleAcceptsPayment,
  computePaymentStatusProjection,
} from './payment-rules';

const rejects = (callback: () => void, code: string) =>
  assert.throws(callback, (error: unknown) => error instanceof DomainError && error.code === code);

test('allocation total must equal payment', () => {
  assertAllocationsEqualPayment('12.0000', ['5', '7']);
  rejects(() => assertAllocationsEqualPayment('12', ['5', '6']), 'ALLOCATIONS_DO_NOT_MATCH_PAYMENT');
});

test('v1 rejects overpayments and refund totals beyond payment', () => {
  assertNoOverpayment('100', '70', '30');
  rejects(() => assertNoOverpayment('100', '70', '30.0001'), 'OVERPAYMENT_NOT_ALLOWED');
  assertRefundWithinLimit('100', '70', '30');
  rejects(() => assertRefundWithinLimit('100', '70', '31'), 'REFUND_LIMIT_EXCEEDED');
});

test('payment lifecycle transitions are constrained', () => {
  assertCanComplete(PaymentStatus.DRAFT);
  assertCanAnnul(PaymentStatus.COMPLETED);
  rejects(() => assertCanComplete(PaymentStatus.COMPLETED), 'PAYMENT_NOT_COMPLETABLE');
  rejects(() => assertCanAnnul(PaymentStatus.DRAFT), 'PAYMENT_NOT_ANNULLABLE');
});

test('prepayment and sale payment target rules are explicit', () => {
  assertOrderAcceptsPrepayment('CONFIRMED');
  rejects(() => assertOrderAcceptsPrepayment('DRAFT'), 'ORDER_DOES_NOT_ACCEPT_PREPAYMENT');
  assertSaleAcceptsPayment('COMPLETED');
  rejects(() => assertSaleAcceptsPayment('DRAFT'), 'SALE_DOES_NOT_ACCEPT_PAYMENT');
});

test('payment status projection covers unpaid through refunded', () => {
  assert.equal(
    computePaymentStatusProjection('100', '0', '0'),
    PaymentStatusProjection.UNPAID,
  );
  assert.equal(
    computePaymentStatusProjection('100', '40', '0'),
    PaymentStatusProjection.PARTIALLY_PAID,
  );
  assert.equal(
    computePaymentStatusProjection('100', '100', '0'),
    PaymentStatusProjection.PAID,
  );
  assert.equal(
    computePaymentStatusProjection('100', '100', '40'),
    PaymentStatusProjection.PARTIALLY_REFUNDED,
  );
  assert.equal(
    computePaymentStatusProjection('100', '100', '100'),
    PaymentStatusProjection.REFUNDED,
  );
});
