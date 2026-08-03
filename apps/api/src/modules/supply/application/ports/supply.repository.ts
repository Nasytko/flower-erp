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
  receivedDate: Date | null;
  paymentDueDate: Date | null;
  paidAt: Date | null;
  supplierDocumentNumber: string | null;
  comment: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: SupplyItemView[];
  supplier?: { id: string; name: string; code: string };
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

export type PostedReceiptItemLink = {
  goodsReceiptId: string;
  goodsReceiptItemId: string;
  supplyItemId: string;
  itemId: string;
  storeId: string;
  warehouseId: string;
  acceptedQuantity: string;
  actualUnitPrice: string;
  receivedAt: Date;
};

export type SupplyLineCorrectionView = {
  id: string;
  actorId: string | null;
  createdAt: string;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  reason: string | null;
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
  receivedDate: Date | null;
  paymentDueDate: Date | null;
  paidAt: Date | null;
  supplierDocumentNumber: string | null;
    comment: string | null;
  }): Promise<SupplyView>;
  updateSupplyHeader(
    organizationId: string,
    storeId: string,
    id: string,
    data: {
      expectedReceiptDate?: Date | null;
      receivedDate?: Date | null;
      paymentDueDate?: Date | null;
      supplierDocumentNumber?: string | null;
      comment?: string | null;
    },
  ): Promise<SupplyView>;
  setSupplyPaidAt(
    organizationId: string,
    storeId: string,
    id: string,
    paidAt: Date | null,
  ): Promise<SupplyView>;
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
  updateSupplyItem(input: {
    organizationId: string;
    supplyId: string;
    itemId: string;
    orderedQuantity: string;
    plannedUnitPrice: string;
  }): Promise<SupplyItemView | null>;
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
  updateReceiptItem(input: {
    id: string;
    receivedQuantity: string;
    acceptedQuantity: string;
    actualUnitPrice: string;
  }): Promise<ReceiptItemView | null>;
  findPostedReceiptItemBySupplyItem(
    organizationId: string,
    supplyItemId: string,
  ): Promise<PostedReceiptItemLink | null>;
  listSupplyLineCorrections(
    organizationId: string,
    storeId: string,
    supplyId: string,
    limit?: number,
  ): Promise<SupplyLineCorrectionView[]>;
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
