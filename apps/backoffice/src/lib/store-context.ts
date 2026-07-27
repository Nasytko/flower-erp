/**
 * Product rule: operational "warehouse" === the store the user is working in.
 * Backend resolves the store default warehouse when warehouseId is omitted.
 */

export const STORE_STOCK_LABEL = 'Остатки магазина';

export function storeStockHint(storeName?: string | null): string {
  if (storeName?.trim()) {
    return `Списание и приём идут через остатки магазина «${storeName.trim()}».`;
  }
  return 'Списание и приём идут через остатки текущего магазина.';
}
