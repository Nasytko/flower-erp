/** Monday of the ISO week containing `date` (UTC date parts). */
export function startOfWeekMonday(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type RetailPricingMode = 'UNIT' | 'SERVICE';

export function retailPricingModeLabel(mode: RetailPricingMode | string | null | undefined): string {
  if (mode === 'SERVICE') return '+1';
  return 'за шт.';
}

/** How many service applications (+1 each) are in the line. */
export function serviceApplicationCount(quantity: string | number | undefined): number {
  const n = Number(quantity);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n);
}

/** e.g. "×2 (+1)" — two packaging applications. */
export function formatServiceQuantityLabel(quantity: string | number | undefined): string {
  const count = serviceApplicationCount(quantity);
  if (count <= 0) return '';
  if (count === 1) return '×1 (+1)';
  return `×${count} (+${count})`;
}

export function formatRetailLineHint(input: {
  itemType?: string | null;
  unitAmount?: string | null;
  pricingMode?: RetailPricingMode | string | null;
  quantity?: string;
  lineTotal?: string | null;
}): string | null {
  if (!input.unitAmount) return null;
  const qty = input.quantity ?? '1';
  const total = input.lineTotal ?? null;
  if (input.pricingMode === 'SERVICE' || input.itemType === 'MATERIAL') {
    const count = serviceApplicationCount(qty);
    if (count <= 1) {
      return total ? `${input.unitAmount} BYN (+1) = ${total} BYN` : `${input.unitAmount} BYN (+1)`;
    }
    return total
      ? `${input.unitAmount} BYN × ${count} (+1) = ${total} BYN`
      : `${input.unitAmount} BYN × ${count} (+1)`;
  }
  return total
    ? `${input.unitAmount} × ${qty} = ${total} BYN`
    : `${input.unitAmount} BYN / шт.`;
}
