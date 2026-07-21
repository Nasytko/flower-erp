export const WORKSPACE_READ_REPOSITORY = Symbol('WORKSPACE_READ_REPOSITORY');

export type WorkspaceOrderRow = {
  id: string;
  number: string;
  status: string;
  readyAt: Date | null;
  type: string;
  occasion: string;
  customerNameSnapshot: string | null;
  assignedFloristId: string | null;
  hasActiveAssignment: boolean;
  hasDeficit: boolean;
  version: number;
  warehouseId: string;
  plannedPrice: string | null;
  recipientName: string | null;
  comment: string | null;
  updatedAt: Date;
};

export type WorkspaceFilter =
  | 'overdue'
  | 'soon'
  | 'unassigned'
  | 'in_preparation'
  | 'ready'
  | 'today'
  | 'partially_reserved'
  | 'all_open';

export type PlannedLineProjection = {
  id: string;
  itemId: string;
  itemName: string;
  itemCode: string;
  plannedQuantity: string;
  reservedQuantity: string;
  availableQuantity: string;
  deficitQuantity: string;
};

export type ActualLineProjection = {
  id: string;
  itemId: string;
  itemName: string;
  itemCode: string;
  actualQuantity: string;
  batchId: string | null;
  comment: string | null;
};

export type PaymentSummaryProjection = {
  plannedPrice: string | null;
  allocatedToOrder: string;
  saleId: string | null;
  saleStatus: string | null;
  saleNetAmount: string | null;
  allocatedToSale: string;
};

export type WorkOrderProjection = {
  order: WorkspaceOrderRow;
  plannedLines: PlannedLineProjection[];
  actualLines: ActualLineProjection[];
  paymentSummary: PaymentSummaryProjection;
};

export type AttentionItemProjection = {
  id: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  code: string;
  title: string;
  reason: string;
  entityType: string;
  entityId: string;
  recommendedAction: string;
  filterLink: string | null;
  ageMinutes: number;
};

export type OperationalKpis = {
  ordersToday: number;
  inProgress: number;
  ready: number;
  overdue: number;
  salesToday: number;
  unpaidBalance: string;
  shortages: number;
  suppliesAwaitingReceipt: number;
};

export type LowStockWarning = {
  itemId: string;
  itemName: string;
  itemCode: string;
  warehouseId: string;
  availableQuantity: string;
  threshold: string;
};

export type OperationalStockRow = {
  itemId: string;
  itemName: string;
  itemCode: string;
  onHandQuantity: string;
  reservedQuantity: string;
  availableQuantity: string;
  /** Present only when caller may view cost — otherwise null. */
  unitCost: string | null;
};

export type InventoryOpsAttentionRow = {
  code: string;
  title: string;
  count: number;
};

export type InventoryTransitRow = {
  transferId: string;
  number: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  dispatchedAt: Date | null;
  totalDispatchedQuantity: string;
  totalReceivedQuantity: string;
  totalDamagedQuantity: string;
};

export type InventoryLossRow = {
  documentType: 'WRITE_OFF' | 'TRANSFER_DAMAGE';
  documentId: string;
  itemId: string;
  quantity: string;
  costAmount: string | null;
};

export type InventoryCountProgressRow = {
  inventoryCountId: string;
  number: string;
  status: string;
  countedItems: number;
  totalItems: number;
  varianceItems: number;
  version: number;
  updatedAt: Date;
};

export interface WorkspaceReadRepository {
  listWorkspaceOrders(input: {
    organizationId: string;
    storeId: string;
    filter: WorkspaceFilter;
    now: Date;
    soonMinutes: number;
    offset: number;
    limit: number;
  }): Promise<{ rows: WorkspaceOrderRow[]; total: number }>;

  countWorkspaceBuckets(input: {
    organizationId: string;
    storeId: string;
    now: Date;
    soonMinutes: number;
  }): Promise<Record<WorkspaceFilter, number>>;

  getWorkOrder(input: {
    organizationId: string;
    storeId: string;
    orderId: string;
  }): Promise<WorkOrderProjection | null>;

  listAttentionItems(input: {
    organizationId: string;
    storeId: string;
    now: Date;
    soonMinutes: number;
    lowStockThreshold: number;
  }): Promise<AttentionItemProjection[]>;

  getOperationalKpis(input: {
    organizationId: string;
    storeId: string;
    now: Date;
  }): Promise<OperationalKpis>;

  listLowStockWarnings(input: {
    organizationId: string;
    storeId: string;
    threshold: number;
  }): Promise<LowStockWarning[]>;

  listOperationalStock(input: {
    organizationId: string;
    storeId: string;
    includeCost: boolean;
  }): Promise<OperationalStockRow[]>;

  listInventoryOpsAttention(input: {
    organizationId: string;
    storeId: string;
  }): Promise<InventoryOpsAttentionRow[]>;

  listInventoryTransit(input: {
    organizationId: string;
    storeId: string;
  }): Promise<InventoryTransitRow[]>;

  listInventoryLosses(input: {
    organizationId: string;
    storeId: string;
    includeCost: boolean;
  }): Promise<InventoryLossRow[]>;

  listInventoryCountProgress(input: {
    organizationId: string;
    storeId: string;
  }): Promise<InventoryCountProgressRow[]>;
}
