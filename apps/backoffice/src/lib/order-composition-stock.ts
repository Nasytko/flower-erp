export type CompositionNeedLine = {
  itemId: string;
  name: string;
  quantity: string;
};

export type StockShortage = {
  itemId: string;
  name: string;
  needed: string;
  available: string;
  missing: string;
};

export function qtyNumber(value: string | undefined | null): number {
  const n = Number(value ?? '0');
  return Number.isFinite(n) ? n : 0;
}

function formatQty(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(3).replace(/\.?0+$/, '');
}

export function buildAvailableStockMap(
  rows: Array<{ itemId: string; availableQuantity: string }>,
): Map<string, string> {
  return new Map(rows.map((row) => [row.itemId, row.availableQuantity]));
}

export function scaleRecipeLines(
  lines: CompositionNeedLine[],
  multiplier: number,
): CompositionNeedLine[] {
  if (multiplier <= 0) return [];
  return lines.map((line) => ({
    ...line,
    quantity: formatQty(qtyNumber(line.quantity) * multiplier),
  }));
}

export function aggregateCompositionNeeds(lines: CompositionNeedLine[]): CompositionNeedLine[] {
  const map = new Map<string, { name: string; quantity: number }>();
  for (const line of lines) {
    const quantity = qtyNumber(line.quantity);
    if (quantity <= 0) continue;
    const prev = map.get(line.itemId);
    if (prev) {
      prev.quantity += quantity;
    } else {
      map.set(line.itemId, { name: line.name, quantity });
    }
  }
  return [...map.entries()].map(([itemId, row]) => ({
    itemId,
    name: row.name,
    quantity: formatQty(row.quantity),
  }));
}

/** Preview shortages from free stock before the order is reserved. */
export function computeStockShortages(
  lines: CompositionNeedLine[],
  stockByItemId: Map<string, string>,
): StockShortage[] {
  return aggregateCompositionNeeds(lines)
    .map((line) => {
      const needed = qtyNumber(line.quantity);
      const available = qtyNumber(stockByItemId.get(line.itemId));
      if (needed <= available) return null;
      return {
        itemId: line.itemId,
        name: line.name,
        needed: line.quantity,
        available: stockByItemId.get(line.itemId) ?? '0',
        missing: formatQty(needed - available),
      };
    })
    .filter((row): row is StockShortage => row !== null)
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

/** Shortages after partial reserve (from order composition lines). */
export function computeReservedShortages(
  lines: Array<{
    itemId: string;
    plannedQuantity: string;
    deficitQuantity?: string;
    item?: { name: string } | null;
  }>,
): StockShortage[] {
  return lines
    .map((line) => {
      const missing = qtyNumber(line.deficitQuantity);
      if (missing <= 0) return null;
      const needed = qtyNumber(line.plannedQuantity);
      return {
        itemId: line.itemId,
        name: line.item?.name ?? line.itemId,
        needed: line.plannedQuantity,
        available: formatQty(Math.max(0, needed - missing)),
        missing: line.deficitQuantity ?? formatQty(missing),
      };
    })
    .filter((row): row is StockShortage => row !== null)
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}
