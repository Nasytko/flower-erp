export const ORDERS_DELIVERY_PORT = Symbol('ORDERS_DELIVERY_PORT');

export type OrderDeliverySnapshot = {
  id: string;
  organizationId: string;
  storeId: string;
  number: string;
  status: string;
  type: 'PICKUP' | 'DELIVERY';
  readyAt: Date | null;
  recipientName: string | null;
  recipientPhone: string | null;
  comment: string | null;
  plannedPrice: string | null;
};

export interface OrdersDeliveryPort {
  getOrderForDelivery(
    organizationId: string,
    storeId: string,
    orderId: string,
  ): Promise<OrderDeliverySnapshot | null>;

  assertFulfillmentChange(
    order: OrderDeliverySnapshot,
    nextType: 'PICKUP' | 'DELIVERY',
  ): void;

  appendOrderTimeline(input: {
    organizationId: string;
    orderId: string;
    type: 'DELIVERY_CREATED' | 'DELIVERY_COMPLETED' | 'DELIVERY_CANCELLED';
    message: string;
    payload?: Record<string, unknown> | null;
    occurredAt: Date;
  }): Promise<void>;

  isOrderReady(order: OrderDeliverySnapshot): boolean;

  getOrderReadinessByIds(
    organizationId: string,
    storeId: string,
    orderIds: string[],
  ): Promise<Map<string, { status: string; number: string; readyAt: Date | null }>>;
}
