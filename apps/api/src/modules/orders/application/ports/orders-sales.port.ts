export const ORDERS_SALES_PORT = Symbol('ORDERS_SALES_PORT');

export type OrderForSaleSnapshot = {
  id: string;
  organizationId: string;
  storeId: string;
  warehouseId: string;
  number: string;
  status: string;
  plannedPrice: string | null;
  customerNameSnapshot: string | null;
  customerPhoneSnapshot: string | null;
  recipientName: string | null;
  comment: string | null;
  actualComposition: {
    id: string;
    frozenAt: Date | null;
    items: Array<{
      id: string;
      itemId: string;
      actualQuantity: string;
      comment: string | null;
    }>;
  } | null;
  compositionItemIds: string[];
};

export interface OrdersSalesPort {
  getReadyOrderForSale(
    organizationId: string,
    storeId: string,
    orderId: string,
  ): Promise<OrderForSaleSnapshot | null>;

  markOrderCompletedFromSale(input: {
    organizationId: string;
    storeId: string;
    orderId: string;
    saleId: string;
  }): Promise<void>;

  revertOrderToReadyFromSaleAnnul(input: {
    organizationId: string;
    storeId: string;
    orderId: string;
    saleId: string;
  }): Promise<void>;
}
