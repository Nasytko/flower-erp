import { Money } from '@flower/shared-kernel';

export enum PaymentMethodType {
  CASH = 'CASH',
  BANK_CARD = 'BANK_CARD',
  ONLINE = 'ONLINE',
  QR = 'QR',
  BANK_TRANSFER = 'BANK_TRANSFER',
  GIFT_CERTIFICATE = 'GIFT_CERTIFICATE',
  OTHER = 'OTHER',
}

export enum PaymentType {
  ORDER_PREPAYMENT = 'ORDER_PREPAYMENT',
  SALE_PAYMENT = 'SALE_PAYMENT',
  REFUND = 'REFUND',
  MANUAL_ADJUSTMENT = 'MANUAL_ADJUSTMENT',
}

export enum PaymentDirection {
  IN = 'IN',
  OUT = 'OUT',
}

export enum PaymentStatus {
  DRAFT = 'DRAFT',
  COMPLETED = 'COMPLETED',
  ANNULLED = 'ANNULLED',
}

export enum PaymentAllocationTargetType {
  ORDER = 'ORDER',
  SALE = 'SALE',
}

export enum PaymentRefundStatus {
  DRAFT = 'DRAFT',
  COMPLETED = 'COMPLETED',
  ANNULLED = 'ANNULLED',
}

export enum PaymentTimelineEventType {
  PAYMENT_CREATED = 'PAYMENT_CREATED',
  PAYMENT_COMPLETED = 'PAYMENT_COMPLETED',
  PAYMENT_ANNULLED = 'PAYMENT_ANNULLED',
  PAYMENT_ALLOCATED_TO_ORDER = 'PAYMENT_ALLOCATED_TO_ORDER',
  PAYMENT_ALLOCATED_TO_SALE = 'PAYMENT_ALLOCATED_TO_SALE',
  PREPAYMENT_TRANSFERRED = 'PREPAYMENT_TRANSFERRED',
  REFUND_CREATED = 'REFUND_CREATED',
  REFUND_COMPLETED = 'REFUND_COMPLETED',
  REFUND_ANNULLED = 'REFUND_ANNULLED',
}

export enum CashAccountType {
  CASH_REGISTER = 'CASH_REGISTER',
  BANK = 'BANK',
  OTHER = 'OTHER',
}

export enum CashAccountStatus {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

export enum CashOperationType {
  PAYMENT_RECEIPT = 'PAYMENT_RECEIPT',
  REFUND_PAYMENT = 'REFUND_PAYMENT',
  MANUAL_INCOME = 'MANUAL_INCOME',
  MANUAL_EXPENSE = 'MANUAL_EXPENSE',
  PAYMENT_ANNULMENT_REVERSAL = 'PAYMENT_ANNULMENT_REVERSAL',
}

export enum CashOperationDirection {
  IN = 'IN',
  OUT = 'OUT',
}

export enum PaymentStatusProjection {
  UNPAID = 'UNPAID',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  PAID = 'PAID',
  PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED',
  REFUNDED = 'REFUNDED',
}

export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

const asMoney = (value: string | Money): Money =>
  value instanceof Money ? value : new Money(value);

export function assertAmountPositive(amount: string | Money): void {
  if (!asMoney(amount).gt(0)) {
    throw new DomainError('INVALID_AMOUNT', 'Amount must be positive');
  }
}

export function assertAllocationsEqualPayment(
  paymentAmount: string | Money,
  allocations: readonly (string | Money)[],
): void {
  let total = Money.zero();
  for (const amount of allocations) {
    total = total.plus(asMoney(amount));
  }
  if (!total.eq(asMoney(paymentAmount))) {
    throw new DomainError(
      'ALLOCATIONS_DO_NOT_MATCH_PAYMENT',
      'Allocation total must equal payment amount',
    );
  }
}

export function assertNoOverpayment(
  targetAmount: string | Money,
  completedAllocatedAmount: string | Money,
  paymentAmount: string | Money,
): void {
  if (asMoney(completedAllocatedAmount).plus(asMoney(paymentAmount)).gt(asMoney(targetAmount))) {
    throw new DomainError('OVERPAYMENT_NOT_ALLOWED', 'Payment would exceed target balance');
  }
}

export function projectPaymentStatus(status: PaymentStatus): PaymentStatus {
  return status;
}

export function computePaymentStatusProjection(
  total: string | Money,
  paid: string | Money,
  refunded: string | Money,
): PaymentStatusProjection {
  const totalAmt = asMoney(total);
  const paidAmt = asMoney(paid);
  const refundedAmt = asMoney(refunded);
  const netPaid = Money.max(paidAmt.minus(refundedAmt), Money.zero());

  if (paidAmt.gt(0) && refundedAmt.gt(0) && netPaid.eq(0)) {
    return PaymentStatusProjection.REFUNDED;
  }
  if (refundedAmt.gt(0) && netPaid.gt(0)) {
    return PaymentStatusProjection.PARTIALLY_REFUNDED;
  }
  if (netPaid.lte(0)) {
    return PaymentStatusProjection.UNPAID;
  }
  if (netPaid.lt(totalAmt)) {
    return PaymentStatusProjection.PARTIALLY_PAID;
  }
  return PaymentStatusProjection.PAID;
}

export function assertCanComplete(status: PaymentStatus): void {
  if (status !== PaymentStatus.DRAFT) {
    throw new DomainError('PAYMENT_NOT_COMPLETABLE', 'Only DRAFT payments can be completed');
  }
}

export function assertCanAnnul(status: PaymentStatus): void {
  if (status !== PaymentStatus.COMPLETED) {
    throw new DomainError('PAYMENT_NOT_ANNULLABLE', 'Only COMPLETED payments can be annulled');
  }
}

export function assertCanRefund(status: PaymentStatus): void {
  if (status !== PaymentStatus.COMPLETED) {
    throw new DomainError('PAYMENT_NOT_REFUNDABLE', 'Only COMPLETED payments can be refunded');
  }
}

export function assertRefundCanComplete(status: PaymentRefundStatus): void {
  if (status !== PaymentRefundStatus.DRAFT) {
    throw new DomainError('REFUND_NOT_COMPLETABLE', 'Only DRAFT refunds can be completed');
  }
}

export function assertRefundCanAnnul(status: PaymentRefundStatus): void {
  if (status === PaymentRefundStatus.ANNULLED) {
    throw new DomainError('REFUND_ALREADY_ANNULLED', 'Refund is already annulled');
  }
}

export function assertRefundWithinLimit(
  paymentAmount: string | Money,
  completedRefundAmount: string | Money,
  refundAmount: string | Money,
): void {
  assertAmountPositive(refundAmount);
  if (asMoney(completedRefundAmount).plus(asMoney(refundAmount)).gt(asMoney(paymentAmount))) {
    throw new DomainError('REFUND_LIMIT_EXCEEDED', 'Refund total cannot exceed original payment');
  }
}

export function assertOrderAcceptsPrepayment(status: string): void {
  if (status === 'DRAFT' || status === 'CANCELLED') {
    throw new DomainError(
      'ORDER_DOES_NOT_ACCEPT_PREPAYMENT',
      'Draft or cancelled orders do not accept prepayments',
    );
  }
}

export function assertSaleAcceptsPayment(status: string): void {
  if (status !== 'COMPLETED') {
    throw new DomainError(
      'SALE_DOES_NOT_ACCEPT_PAYMENT',
      'Only completed sales accept payments',
    );
  }
}

export function assertCurrencyByn(currencyCode: string): void {
  if (currencyCode !== 'BYN') {
    throw new DomainError('UNSUPPORTED_CURRENCY', 'Only BYN is supported in v1');
  }
}

export { Money };
