export const DELIVERY_READINESS_PORT = Symbol('DELIVERY_READINESS_PORT');

/**
 * Optional hook for DeliveryModule after Order MarkReady.
 * Owned by orders; implemented by delivery (no Nest Orders→Delivery import).
 */
export interface DeliveryReadinessPort {
  onOrderMarkedReady(
    organizationId: string,
    storeId: string,
    orderId: string,
  ): Promise<void>;
}
