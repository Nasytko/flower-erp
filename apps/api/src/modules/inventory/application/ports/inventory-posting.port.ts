export const INVENTORY_POSTING_PORT = Symbol('INVENTORY_POSTING_PORT');

export type ReceiptPostingLine = {
  goodsReceiptItemId: string;
  itemId: string;
  acceptedQuantity: string;
  actualUnitPrice: string;
  receivedAt: Date;
  itemType: 'FLOWER' | 'MATERIAL';
  defaultShelfLifeDays: number | null;
};

export type PostGoodsReceiptCommand = {
  organizationId: string;
  storeId: string;
  warehouseId: string;
  goodsReceiptId: string;
  idempotencyKey?: string;
  lines: ReceiptPostingLine[];
};

export type ReverseGoodsReceiptCommand = {
  organizationId: string;
  storeId: string;
  warehouseId: string;
  goodsReceiptId: string;
  /** GoodsReceiptItem ids owned by the receipt — inventory must not join Supply tables. */
  goodsReceiptItemIds: string[];
  idempotencyKey?: string;
};

export type AdjustGoodsReceiptItemCommand = {
  organizationId: string;
  storeId: string;
  warehouseId: string;
  goodsReceiptId: string;
  goodsReceiptItemId: string;
  itemId: string;
  /** New accepted quantity on the receipt line (absolute, not delta). */
  acceptedQuantity: string;
  actualUnitPrice: string;
  occurredAt: Date;
};

export interface InventoryPostingPort {
  postGoodsReceipt(command: PostGoodsReceiptCommand): Promise<void>;
  reverseGoodsReceipt(command: ReverseGoodsReceiptCommand): Promise<void>;
  adjustGoodsReceiptItem(command: AdjustGoodsReceiptItemCommand): Promise<void>;
}
