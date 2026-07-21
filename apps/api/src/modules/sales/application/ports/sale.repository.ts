import type {
  DiscountReason,
  DiscountType,
  SaleInventorySourceType,
  SaleStatus,
  SaleType,
  SalesChannel,
} from '../../domain/sale-rules';

export const SALE_REPOSITORY = Symbol('SALE_REPOSITORY');

export type SaleLineView = {
  id: string;
  organizationId: string;
  saleId: string;
  itemId: string | null;
  descriptionSnapshot: string;
  quantity: string;
  unitPrice: string;
  grossAmount: string;
  discountAmount: string;
  netAmount: string;
  sortOrder: number;
  createdAt: Date;
};

export type SaleDiscountView = {
  id: string;
  organizationId: string;
  saleId: string;
  type: DiscountType;
  value: string;
  reason: DiscountReason;
  comment: string | null;
  approvedByMembershipId: string | null;
  createdAt: Date;
};

export type SaleConsumptionLineView = {
  id: string;
  organizationId: string;
  consumptionId: string;
  itemId: string;
  requestedQuantity: string;
  issuedQuantity: string;
  costAmount: string;
  createdAt: Date;
};

export type SaleConsumptionView = {
  id: string;
  organizationId: string;
  saleId: string;
  sourceType: SaleInventorySourceType;
  createdAt: Date;
  lines: SaleConsumptionLineView[];
};

export type SaleTimelineEventView = {
  id: string;
  organizationId: string;
  saleId: string;
  type: string;
  message: string | null;
  actorMembershipId: string | null;
  payload: unknown;
  occurredAt: Date;
  createdAt: Date;
};

export type SaleAnnulmentView = {
  id: string;
  organizationId: string;
  saleId: string;
  reason: string;
  actorMembershipId: string | null;
  createdAt: Date;
};

export type SaleView = {
  id: string;
  organizationId: string;
  storeId: string;
  warehouseId: string;
  orderId: string | null;
  number: string;
  type: SaleType;
  status: SaleStatus;
  salesChannel: SalesChannel;
  grossAmount: string;
  discountAmount: string;
  netAmount: string;
  costAmount: string | null;
  grossProfitAmount: string | null;
  marginPercent: string | null;
  currencyCode: string;
  comment: string | null;
  completedAt: Date | null;
  annulledAt: Date | null;
  createdByMembershipId: string | null;
  createdAt: Date;
  updatedAt: Date;
  lines: SaleLineView[];
  discount: SaleDiscountView | null;
  consumption: SaleConsumptionView | null;
  annulment: SaleAnnulmentView | null;
};

export type CreateSaleLineInput = {
  id: string;
  itemId: string | null;
  descriptionSnapshot: string;
  quantity: string;
  unitPrice: string;
  grossAmount: string;
  discountAmount: string;
  netAmount: string;
  sortOrder: number;
};

export type CreateSaleDiscountInput = {
  id: string;
  type: DiscountType;
  value: string;
  reason: DiscountReason;
  comment: string | null;
  approvedByMembershipId: string | null;
};

export type CreateSaleInput = {
  id: string;
  organizationId: string;
  storeId: string;
  warehouseId: string;
  orderId: string | null;
  number: string;
  type: SaleType;
  salesChannel: SalesChannel;
  grossAmount: string;
  discountAmount: string;
  netAmount: string;
  currencyCode: string;
  comment: string | null;
  createdByMembershipId: string | null;
  lines: CreateSaleLineInput[];
  discount: CreateSaleDiscountInput | null;
};

export type SaveConsumptionInput = {
  id: string;
  organizationId: string;
  saleId: string;
  sourceType: SaleInventorySourceType;
  lines: Array<{
    id: string;
    itemId: string;
    requestedQuantity: string;
    issuedQuantity: string;
    costAmount: string;
  }>;
};

export type SaleListFilter = {
  status?: SaleStatus;
  type?: SaleType;
  orderId?: string;
};

export interface SaleRepository {
  uniqueNumber(prefix: string, organizationId: string): Promise<string>;

  createSale(input: CreateSaleInput): Promise<SaleView>;

  getSale(
    organizationId: string,
    storeId: string,
    saleId: string,
  ): Promise<SaleView | null>;

  listSales(
    organizationId: string,
    storeId: string,
    filter?: SaleListFilter,
  ): Promise<SaleView[]>;

  findActiveByOrderId(
    organizationId: string,
    orderId: string,
  ): Promise<SaleView | null>;

  markCompleted(input: {
    organizationId: string;
    storeId: string;
    saleId: string;
    completedAt: Date;
    costAmount: string;
    grossProfitAmount: string;
    marginPercent: string | null;
  }): Promise<SaleView>;

  markAnnulled(input: {
    organizationId: string;
    storeId: string;
    saleId: string;
    annulledAt: Date;
  }): Promise<SaleView>;

  saveConsumption(input: SaveConsumptionInput): Promise<SaleConsumptionView>;

  getConsumption(
    organizationId: string,
    saleId: string,
  ): Promise<SaleConsumptionView | null>;

  appendTimeline(input: {
    id: string;
    organizationId: string;
    saleId: string;
    type: string;
    message: string | null;
    actorMembershipId: string | null;
    payload: unknown;
    occurredAt: Date;
  }): Promise<SaleTimelineEventView>;

  listTimeline(
    organizationId: string,
    saleId: string,
  ): Promise<SaleTimelineEventView[]>;

  createAnnulment(input: {
    id: string;
    organizationId: string;
    saleId: string;
    reason: string;
    actorMembershipId: string | null;
  }): Promise<SaleAnnulmentView>;
}
