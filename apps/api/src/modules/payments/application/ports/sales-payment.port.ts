export const SALES_PAYMENT_PORT = Symbol('SALES_PAYMENT_PORT');

export type SalePaymentTarget = {
  id: string;
  status: string;
  storeId: string;
  netAmount: string;
  orderId: string | null;
};

export interface SalesPaymentPort {
  getSalePaymentTarget(organizationId: string, storeId: string, saleId: string): Promise<SalePaymentTarget | null>;
  findActiveSaleIdByOrderId(organizationId: string, storeId: string, orderId: string): Promise<string | null>;
  assertAcceptsPayment(target: SalePaymentTarget): void;
  appendTimelineEvent(input: {
    organizationId: string;
    saleId: string;
    paymentId: string;
    status: string;
    occurredAt: Date;
  }): Promise<void>;
}
