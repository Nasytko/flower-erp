import type {
  CashAccountView,
  CashOperationView,
  PaymentMethodView,
  PaymentRefundView,
  PaymentTimelineEventView,
  PaymentView,
} from '../application/ports/payment.repository';
import type { PaymentSummaryView } from '../application/payment.use-cases';

export function presentPayment(payment: PaymentView) {
  return {
    ...payment,
    amount: payment.amount,
    allocations: payment.allocations.map((allocation) => ({
      ...allocation,
      amount: allocation.amount,
    })),
  };
}

export function presentRefund(refund: PaymentRefundView) {
  return {
    ...refund,
    amount: refund.amount,
  };
}

export function presentMethod(method: PaymentMethodView) {
  return method;
}

export function presentTimeline(events: PaymentTimelineEventView[]) {
  return events;
}

export function presentSummary(summary: PaymentSummaryView) {
  return summary;
}

export function presentCashAccount(account: CashAccountView) {
  return account;
}

export function presentCashOperation(operation: CashOperationView) {
  return {
    ...operation,
    amount: operation.amount,
  };
}
