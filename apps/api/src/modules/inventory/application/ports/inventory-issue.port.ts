export const INVENTORY_ISSUE_PORT = Symbol('INVENTORY_ISSUE_PORT');

export type IssueSaleLine = {
  itemId: string;
  quantity: string;
  /** Composition item ids whose ACTIVE reservations may be consumed first */
  reservationSourceItemIds?: string[];
};

export type IssueForSaleCommand = {
  organizationId: string;
  storeId: string;
  warehouseId: string;
  saleId: string;
  orderId?: string | null;
  lines: IssueSaleLine[];
  idempotencyKey: string;
  occurredAt: Date;
};

export type IssuedAllocation = {
  itemId: string;
  batchId: string;
  quantity: string;
  unitCost: string;
  costAmount: string;
};

export type IssueForSaleResult = {
  allocations: IssuedAllocation[];
  totalCostAmount: string;
  /** Already completed for same key+saleId */
  idempotentReplay: boolean;
};

export type ReverseIssueCommand = {
  organizationId: string;
  storeId: string;
  warehouseId: string;
  saleId: string;
  idempotencyKey: string;
  occurredAt: Date;
};

export interface InventoryIssuePort {
  issueForSale(command: IssueForSaleCommand): Promise<IssueForSaleResult>;
  reverseIssue(command: ReverseIssueCommand): Promise<{ idempotentReplay: boolean }>;
}
