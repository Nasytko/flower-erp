import type { ApiClient } from '@flower/api-client';
import { qtyNumber } from '@/lib/order-composition-stock';

export type CompositionQtyMap = Map<string, number>;

export function compositionLinesToMap(
  items: Array<{ itemId: string; plannedQuantity: string }>,
): CompositionQtyMap {
  const map = new Map<string, number>();
  for (const line of items) {
    const qty = qtyNumber(line.plannedQuantity);
    if (qty <= 0) continue;
    map.set(line.itemId, (map.get(line.itemId) ?? 0) + qty);
  }
  return map;
}

export function recipeLinesToMap(
  lines: Array<{ componentItemId: string; quantity: string }>,
): CompositionQtyMap {
  const map = new Map<string, number>();
  for (const line of lines) {
    const qty = qtyNumber(line.quantity);
    if (qty <= 0) continue;
    map.set(line.componentItemId, (map.get(line.componentItemId) ?? 0) + qty);
  }
  return map;
}

export function compositionMapsEqual(a: CompositionQtyMap, b: CompositionQtyMap): boolean {
  if (a.size !== b.size) return false;
  for (const [itemId, qtyA] of a) {
    const qtyB = b.get(itemId);
    if (qtyB === undefined || Math.abs(qtyA - qtyB) > 1e-6) return false;
  }
  return true;
}

/** Match order composition lines to a catalog bouquet recipe (exact qty per ingredient). */
export async function detectBouquetFromComposition(
  client: ApiClient,
  organizationId: string,
  compositionMap: CompositionQtyMap,
): Promise<string | null> {
  if (compositionMap.size === 0) return null;

  const bouquets = await client.listShowcaseBouquets(organizationId);
  const candidates = bouquets.filter((b) => b.recipeLineCount > 0);

  for (const bouquet of candidates) {
    const recipe = await client.getItemRecipe(organizationId, bouquet.id);
    const recipeMap = recipeLinesToMap(recipe.lines);
    if (compositionMapsEqual(compositionMap, recipeMap)) {
      return bouquet.id;
    }
  }
  return null;
}

export function validateShowcaseBouquetSelection(
  showcaseBouquetId: string,
  bouquets: Array<{ id: string; recipeLineCount: number }>,
): string | undefined {
  if (!showcaseBouquetId) return 'Выберите букет';
  const bouquet = bouquets.find((b) => b.id === showcaseBouquetId);
  if (bouquet && bouquet.recipeLineCount === 0) {
    return 'У выбранного букета нет состава — задайте рецепт в каталоге';
  }
  return undefined;
}
