import type { RetailPricingMode } from '../../domain/master-data-rules';

export const ITEM_RETAIL_PRICE_REPOSITORY = Symbol('ITEM_RETAIL_PRICE_REPOSITORY');

export type ItemRetailPriceRow = {
  id: string;
  organizationId: string;
  itemId: string;
  effectiveFrom: Date;
  amount: string;
  pricingMode: RetailPricingMode;
  createdAt: Date;
  updatedAt: Date;
};

export type ItemRetailPriceListRow = ItemRetailPriceRow & {
  item: {
    id: string;
    name: string;
    code: string;
    itemType: string;
    status: string;
  };
};

export type ResolvedRetailPrice = {
  itemId: string;
  amount: string;
  pricingMode: RetailPricingMode;
  effectiveFrom: Date;
  itemType: string;
  itemName: string;
  itemCode: string;
};

export interface ItemRetailPriceRepository {
  upsert(input: {
    id: string;
    organizationId: string;
    itemId: string;
    effectiveFrom: Date;
    amount: string;
    pricingMode: RetailPricingMode;
    createdByMembershipId: string | null;
  }): Promise<ItemRetailPriceRow>;
  listForWeek(organizationId: string, effectiveFrom: Date): Promise<ItemRetailPriceListRow[]>;
  resolveForItems(
    organizationId: string,
    itemIds: string[],
    asOfDate: Date,
  ): Promise<ResolvedRetailPrice[]>;
}
