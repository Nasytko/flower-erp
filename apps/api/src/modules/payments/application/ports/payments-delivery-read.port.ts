export const PAYMENTS_DELIVERY_READ_PORT = Symbol('PAYMENTS_DELIVERY_READ_PORT');

export type DeliveryPaymentSummary = {
  orderTotal: string;
  paidAmount: string;
  refundedAmount: string;
  balanceDue: string;
  paymentStatus: string;
};

/**
 * Read-only payment summary for Delivery. Owned by payments; consumed by delivery.
 */
export interface PaymentsDeliveryReadPort {
  getOrderPaymentSummary(
    organizationId: string,
    storeId: string,
    orderId: string,
  ): Promise<DeliveryPaymentSummary | null>;
}
