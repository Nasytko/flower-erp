import { Money } from '@flower/shared-kernel';
import type { RecipeLineInput } from './item-recipe-rules';

export type IssueLineInput = {
  itemId: string;
  quantity: string;
};

/** Scale recipe lines by ready-bouquet quantity for inventory issue. */
export function expandRecipeForQuantity(
  bouquetQuantity: string,
  recipe: RecipeLineInput[],
): IssueLineInput[] {
  const multiplier = new Money(bouquetQuantity);
  return recipe.map((line) => ({
    itemId: line.componentItemId,
    quantity: multiplier.mul(line.quantity).toString(),
  }));
}

/** Merge issue lines by item id (sum quantities). */
export function mergeIssueLines(lines: IssueLineInput[]): IssueLineInput[] {
  const byItem = new Map<string, Money>();
  for (const line of lines) {
    const prev = byItem.get(line.itemId) ?? Money.zero();
    byItem.set(line.itemId, prev.plus(line.quantity));
  }
  return [...byItem.entries()].map(([itemId, quantity]) => ({
    itemId,
    quantity: quantity.toString(),
  }));
}
