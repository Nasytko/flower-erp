export const DELIVERY_FULFILLMENT_PORT = Symbol('DELIVERY_FULFILLMENT_PORT');

/**
 * Optional hook when Order fulfillment type changes (PICKUP ↔ DELIVERY).
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
  }): Promise<void>;
}
