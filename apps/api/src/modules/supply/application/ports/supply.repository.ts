import type { GoodsReceiptStatus, SupplyStatus } from '../../domain/supply-rules';

export const SUPPLY_REPOSITORY = Symbol('SUPPLY_REPOSITORY');

export type SupplyItemView = {
  id: string;
  organizationId: string;
  supplyId: string;
  itemId: string;
  orderedQuantity: string;
  plannedUnitPrice: string | null;
  item: {
    id: string;
    name: string;
    code: string;
    unitId: string;
    inventoryPolicyId: string;
    itemType: string;
    isPurchasable: boolean;
    status: string;
  };
};

export type SupplyView = {
  id: string;
  organizationId: string;
  storeId: string;
  warehouseId: string;
  supplierId: string;
  number: string;
  status: SupplyStatus | string;
  submittedAt: Date | null;
  expectedReceiptDate: Date | null;
  comment: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: SupplyItemView[];
};

export type ReceiptItemView = {
  id: string;
  organizationId: string;
  goodsReceiptId: string;
  supplyItemId: string;
  itemId: string;
  receivedQuantity: string;
  acceptedQuantity: string;
  defectiveQuantity: string;
  actualUnitPrice: string;
  defectReason: string | null;
  item: SupplyItemView['item'];
  supplyItem: { id: string; orderedQuantity: string };
};

export type ReceiptView = {
  id: string;
  organizationId: string;
  storeId: string;
  warehouseId: string;
  supplyId: string;
  number: string;
  status: GoodsReceiptStatus | string;
  receivedAt: Date;
  postedAt: Date | null;
  comment: string | null;
  items: ReceiptItemView[];
};

export interface SupplyRepository {
  createSupply(input: {
    id: string;
    organizationId: string;
    storeId: string;
    warehouseId: string;
    supplierId: string;
    number: string;
    expectedReceiptDate: Date | null;
    comment: string | null;
  }): Promise<SupplyView>;
  getSupply(organizationId: string, storeId: string, id: string): Promise<SupplyView | null>;
  listSupplies(organizationId: string, storeId: string, status?: string): Promise<SupplyView[]>;
  addSupplyItem(input: {
    id: string;
    organizationId: string;
    supplyId: string;
    itemId: string;
    orderedQuantity: string;
    plannedUnitPrice: string | null;
  }): Promise<SupplyItemView>;
  removeSupplyItem(
    organizationId: string,
    supplyId: string,
    itemId: string,
  ): Promise<{ count: number }>;
  updateSupplyStatus(
    id: string,
    status: string,
    submittedAt?: Date | null,
  ): Promise<void>;
  getSupplyItem(
    organizationId: string,
    supplyId: string,
    id: string,
  ): Promise<SupplyItemView | null>;
  createReceipt(input: {
    id: string;
    organizationId: string;
    storeId: string;
    warehouseId: string;
    supplyId: string;
    number: string;
    receivedAt: Date;
    comment: string | null;
  }): Promise<ReceiptView>;
  getReceipt(organizationId: string, storeId: string, id: string): Promise<ReceiptView | null>;
  listReceipts(
    organizationId: string,
    storeId: string,
    supplyId: string,
  ): Promise<ReceiptView[]>;
  addReceiptItem(input: {
    id: string;
    organizationId: string;
    goodsReceiptId: string;
    supplyItemId: string;
    itemId: string;
    receivedQuantity: string;
    acceptedQuantity: string;
    defectiveQuantity: string;
    actualUnitPrice: string;
    defectReason: string | null;
  }): Promise<ReceiptItemView>;
  setReceiptPosted(id: string, postedAt: Date): Promise<ReceiptView>;
  setReceiptReversed(id: string): Promise<ReceiptView>;
  sumPostedBySupplyItem(organizationId: string, supplyItemId: string): Promise<string>;
  sumDraftOtherBySupplyItem(
    organizationId: string,
    supplyItemId: string,
    receiptId: string,
  ): Promise<string>;
  uniqueNumber(prefix: string, organizationId: string): Promise<string>;
}
