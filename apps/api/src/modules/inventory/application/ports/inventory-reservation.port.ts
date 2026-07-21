export const INVENTORY_RESERVATION_PORT = Symbol('INVENTORY_RESERVATION_PORT');

/** Opaque composition line id — OrderCompositionItem.id */
export type ReserveCompositionLine = {
  compositionItemId: string;
  itemId: string;
  quantity: string;
};

export type ReserveCompositionCommand = {
  organizationId: string;
  storeId: string;
  warehouseId: string;
  orderId: string;
  lines: ReserveCompositionLine[];
};

export type ReleaseCompositionCommand = {
  organizationId: string;
  storeId: string;
  warehouseId: string;
  orderId: string;
  compositionItemIds: string[];
};

export type LineAllocationResult = {
  compositionItemId: string;
  itemId: string;
  requestedQuantity: string;
  reservedQuantity: string;
  deficitQuantity: string;
};

export type ReserveCompositionResult = {
  outcome: 'FULL' | 'PARTIAL' | 'NONE';
  lines: LineAllocationResult[];
};

/**
 * @deprecated Prefer ReserveComposition* types (ADR-015). Kept as aliases for gradual migration.
 */
export type ReserveOrderLine = {
  orderItemId: string;
  itemId: string;
  quantity: string;
};
export type ReserveOrderStockCommand = {
  organizationId: string;
  storeId: string;
  warehouseId: string;
  orderId: string;
  lines: ReserveOrderLine[];
};
export type ReleaseOrderStockCommand = {
  organizationId: string;
  storeId: string;
  warehouseId: string;
  orderId: string;
  orderItemIds: string[];
};
export type ReserveOrderStockResult = {
  fullyReserved: boolean;
  lines: Array<{
    orderItemId: string;
    itemId: string;
    requestedQuantity: string;
    reservedQuantity: string;
    deficitQuantity: string;
  }>;
};

export interface InventoryReservationPort {
  /**
   * Partial allowed (ADR-015): reserves as much as available per line (FEFO/FIFO).
   * Releases prior ACTIVE for these composition item ids first, then creates new ACTIVE holds.
   */
  reserveComposition(command: ReserveCompositionCommand): Promise<ReserveCompositionResult>;
  releaseComposition(command: ReleaseCompositionCommand): Promise<void>;
  sumActiveReservedByCompositionItems(
    organizationId: string,
    compositionItemIds: string[],
  ): Promise<Map<string, string>>;

  /** @deprecated Use reserveComposition */
  reserveForOrder(command: ReserveOrderStockCommand): Promise<ReserveOrderStockResult>;
  /** @deprecated Use releaseComposition */
  releaseForOrder(command: ReleaseOrderStockCommand): Promise<void>;
  /** @deprecated Use sumActiveReservedByCompositionItems */
  sumActiveReservedByOrderItems(
    organizationId: string,
    orderItemIds: string[],
  ): Promise<Map<string, string>>;
}
