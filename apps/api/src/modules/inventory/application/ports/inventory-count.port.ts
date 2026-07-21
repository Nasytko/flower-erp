export const INVENTORY_COUNT_PORT = Symbol('INVENTORY_COUNT_PORT');

export type InventoryCountSnapshotRow = {
  itemId: string;
  expectedQuantity: string;
};

export type InventoryCountAdjustmentLine = {
  inventoryCountItemId: string;
  itemId: string;
  varianceQuantity: string;
  movementType: 'COUNT_ADJUSTMENT_IN' | 'COUNT_ADJUSTMENT_OUT';
};

export type PostInventoryCountCommand = {
  organizationId: string;
  storeId: string;
  warehouseId: string;
  inventoryCountId: string;
  occurredAt: Date;
  idempotencyKey: string;
  lines: InventoryCountAdjustmentLine[];
};

export interface InventoryCountPort {
  snapshotCount(
    organizationId: string,
    storeId: string,
    warehouseId: string,
  ): Promise<InventoryCountSnapshotRow[]>;
  postInventoryCount(command: PostInventoryCountCommand): Promise<{ idempotentReplay: boolean }>;
}
