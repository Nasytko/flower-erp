export const INVENTORY_QUERY_REPOSITORY = Symbol('INVENTORY_QUERY_REPOSITORY');

export type BalanceView = {
  id: string;
  itemId: string;
  onHandQuantity: string;
  reservedQuantity: string;
  availableQuantity: string;
  item?: { name: string; code: string };
};

export type BatchView = {
  id: string;
  itemId: string;
  initialQuantity: string;
  remainingQuantity: string;
  unitCost: string;
  status: string;
  expiresAt: Date | null;
  item?: { name: string; code: string };
};

export type MovementView = {
  id: string;
  type: string;
  quantity: string;
  unitCost: string | null;
  itemId: string;
  occurredAt: Date;
  item?: { name: string; code: string };
};

export interface InventoryQueryRepository {
  listBalances(
    organizationId: string,
    storeId: string,
    warehouseId: string,
  ): Promise<BalanceView[]>;
  listBatches(
    organizationId: string,
    storeId: string,
    warehouseId: string,
  ): Promise<BatchView[]>;
  listMovements(
    organizationId: string,
    storeId: string,
    warehouseId: string,
  ): Promise<MovementView[]>;
}
