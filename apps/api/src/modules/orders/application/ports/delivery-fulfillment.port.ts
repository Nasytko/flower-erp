export const DELIVERY_FULFILLMENT_PORT = Symbol('DELIVERY_FULFILLMENT_PORT');

/**
 * Order ↔ Delivery fulfillment bridge.
 * Owned by orders; implemented by delivery.
 */
export interface DeliveryFulfillmentPort {
  onFulfillmentTypeChanged(input: {
    organizationId: string;
    storeId: string;
    orderId: string;
    previousType: 'PICKUP' | 'DELIVERY';
    nextType: 'PICKUP' | 'DELIVERY';
    recipientName?: string | null;
    recipientPhone?: string | null;
    addressLine?: string | null;
    city?: string | null;
    readyAt?: string | null;
  }): Promise<void>;

  /** Create (or keep) delivery job for a DELIVERY order with a real address. */
  ensureDeliveryForOrder(input: {
    organizationId: string;
    storeId: string;
    orderId: string;
    addressLine: string;
    city?: string | null;
    recipientName?: string | null;
    recipientPhone?: string | null;
    readyAt?: string | null;
  }): Promise<void>;
}
