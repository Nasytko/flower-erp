export const ORDERS_PAYMENT_PORT = Symbol('ORDERS_PAYMENT_PORT');

export type OrderPaymentTarget = {
  id: string;
  status: string;
  storeId: string;
  totalAmount: string | null;
};

export interface OrdersPaymentPort {
  getOrderPaymentTarget(
    organizationId: string,
    storeId: string,
    orderId: string,
  ): Promise<OrderPaymentTarget | null>;
  assertAcceptsPrepayment(target: OrderPaymentTarget): void;
}
