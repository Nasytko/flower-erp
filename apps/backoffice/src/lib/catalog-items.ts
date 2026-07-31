import type { ApiClient } from '@flower/api-client';

/** API max page size (see PaginationQueryDto @Max(100)). */
export const CATALOG_ITEMS_PAGE_SIZE = 100;

export type CatalogItemRow = {
  id: string;
  name: string;
  code: string;
  itemType: string;
  status?: string;
  isSellable?: boolean;
  isPurchasable?: boolean;
  isShowcase?: boolean;
};

export type ListCatalogItemsFilter = {
  status?: string;
  itemType?: string;
  isSellable?: boolean;
  name?: string;
  code?: string;
};

/** Fetch all catalog items matching filter, paging through API in chunks of 100. */
export async function listAllCatalogItems(
  client: ApiClient,
  organizationId: string,
  filter: ListCatalogItemsFilter = {},
): Promise<CatalogItemRow[]> {
  const items: CatalogItemRow[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const result = await client.listItems(organizationId, {
      ...filter,
      page,
      pageSize: CATALOG_ITEMS_PAGE_SIZE,
      sortBy: 'name',
      sortDir: 'asc',
    });
    items.push(...result.items);
    totalPages = result.totalPages;
    page += 1;
  } while (page <= totalPages);

  return items;
}

export type SupplierRow = {
  id: string;
  name: string;
  code: string;
};

/** Fetch all active suppliers, paging through API in chunks of 100. */
export async function listAllSuppliers(
  client: ApiClient,
  organizationId: string,
  filter: { status?: string; name?: string } = { status: 'ACTIVE' },
): Promise<SupplierRow[]> {
  const items: SupplierRow[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const result = await client.listSuppliers(organizationId, {
      ...filter,
      page,
      pageSize: CATALOG_ITEMS_PAGE_SIZE,
    });
    items.push(...result.items);
    totalPages = result.totalPages;
    page += 1;
  } while (page <= totalPages);

  return items;
}

/** Ingredients only — flowers and materials used in recipes and custom assembly. */
export function filterRecipeIngredients(items: CatalogItemRow[], excludeItemId?: string) {
  return items.filter(
    (row) =>
      row.id !== excludeItemId &&
      !row.isSellable &&
      (row.itemType === 'FLOWER' || row.itemType === 'MATERIAL'),
  );
}
