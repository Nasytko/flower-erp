export type OrderBoardCompositionLine = {
  compositionItemId: string;
  itemId: string;
  itemName: string;
  plannedQuantity: string;
};

export type OrderBoardStockInput = {
  status: string;
  lines: OrderBoardCompositionLine[];
  reservedByCompositionItemId: Map<string, string>;
  availableByItemId: Map<string, string>;
};

export type OrderBoardStockHint = {
  hasStockDeficit: boolean;
  stockShortageHint: string | null;
};

function compareQty(a: string, b: string): number {
  const left = Number(a);
  const right = Number(b);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return 0;
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function subtractQty(a: string, b: string): string {
  const value = Number(a) - Number(b);
  if (!Number.isFinite(value) || value <= 0) return '0';
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(3).replace(/\.?0+$/, '');
}

function formatMissingHint(name: string, missing: string): string {
  if (compareQty(missing, '0') <= 0) return name;
  return `${name} ×${missing}`;
}

function addQty(a: string, b: string): string {
  const value = Number(a) + Number(b);
  if (!Number.isFinite(value) || value <= 0) return '0';
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(3).replace(/\.?0+$/, '');
}

/** Reservation deficit or free-stock preview for confirmed orders. */
export function resolveOrderBoardStockHint(input: OrderBoardStockInput): OrderBoardStockHint {
  const useStockPreview = input.status === 'CONFIRMED' || input.status === 'DRAFT';
  const shortages = new Map<string, { name: string; missing: string }>();

  for (const line of input.lines) {
    const planned = line.plannedQuantity;
    if (compareQty(planned, '0') <= 0) continue;

    let missing = '0';
    if (useStockPreview) {
      const available = input.availableByItemId.get(line.itemId) ?? '0';
      if (compareQty(planned, available) > 0) {
        missing = subtractQty(planned, available);
      }
    } else {
      const reserved = input.reservedByCompositionItemId.get(line.compositionItemId) ?? '0';
      if (compareQty(planned, reserved) > 0) {
        missing = subtractQty(planned, reserved);
      }
    }

    if (compareQty(missing, '0') <= 0) continue;

    const prev = shortages.get(line.itemId);
    if (prev) {
      shortages.set(line.itemId, {
        name: line.itemName,
        missing: addQty(prev.missing, missing),
      });
    } else {
      shortages.set(line.itemId, { name: line.itemName, missing });
    }
  }

  if (shortages.size === 0) {
    return { hasStockDeficit: false, stockShortageHint: null };
  }

  const rows = [...shortages.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const first = rows[0]!;
  const hint =
    rows.length === 1
      ? formatMissingHint(first.name, first.missing)
      : `${formatMissingHint(first.name, first.missing)} +${rows.length - 1}`;

  return { hasStockDeficit: true, stockShortageHint: hint };
}
