/** Helpers for store dashboard KPI aggregation (client-side). */

export function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

export function endOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

export function isWithinLocalDay(iso: string | null | undefined, day: Date): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return t >= startOfLocalDay(day).getTime() && t <= endOfLocalDay(day).getTime();
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function formatMoney(value: number, currency = 'RUB'): string {
  try {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${value.toFixed(0)} ${currency}`;
  }
}

export function formatQty(value: number): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value);
}

export type PendingDeliveryRow = {
  id: string;
  orderNumber: string | null;
  status: string;
  urgency: string;
  windowStart: string;
  windowEnd: string;
  displayAddress: string;
  recipientName?: string;
};

type BoardLike = {
  sections: {
    needsPlanning: PendingDeliveryRow[];
    withoutCourier: PendingDeliveryRow[];
    orderPreparing: PendingDeliveryRow[];
    readyForDispatch: PendingDeliveryRow[];
    assigned: PendingDeliveryRow[];
    inTransit: PendingDeliveryRow[];
    problems: PendingDeliveryRow[];
    delivered: PendingDeliveryRow[];
  };
};

export function flattenPendingDeliveries(board: BoardLike): PendingDeliveryRow[] {
  const { delivered: _delivered, ...pending } = board.sections;
  void _delivered;
  return [
    ...pending.problems,
    ...pending.needsPlanning,
    ...pending.withoutCourier,
    ...pending.orderPreparing,
    ...pending.readyForDispatch,
    ...pending.assigned,
    ...pending.inTransit,
  ];
}

export function sumStockValue(
  rows: Array<{
    onHandQuantity: string;
    availableQuantity?: string;
    unitCost: string | null;
  }>,
): { qtyOnHand: number; qtyAvailable: number; value: number; hasCost: boolean } {
  let qtyOnHand = 0;
  let qtyAvailable = 0;
  let value = 0;
  let hasCost = false;
  for (const row of rows) {
    const onHand = Number(row.onHandQuantity);
    const available = Number(row.availableQuantity ?? row.onHandQuantity);
    if (!Number.isNaN(onHand)) qtyOnHand += onHand;
    if (!Number.isNaN(available)) qtyAvailable += available;
    const cost = row.unitCost != null ? Number(row.unitCost) : NaN;
    if (!Number.isNaN(onHand) && !Number.isNaN(cost)) {
      value += onHand * cost;
      hasCost = true;
    }
  }
  return { qtyOnHand, qtyAvailable, value, hasCost };
}
