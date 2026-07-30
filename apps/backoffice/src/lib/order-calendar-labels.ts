import type { OrderBoardCardDto, OrderBoardColumn } from '@flower/api-client';

export const ORDER_BOARD_COLUMN_LABELS: Record<OrderBoardColumn, string> = {
  NEW: 'Новые',
  IN_WORK: 'В сборке',
  READY: 'Собранные',
  WITH_COURIER: 'У курьера',
  HANDED_OFF: 'Завершённые',
};

export const ORDER_BOARD_COLUMN_TONE: Record<OrderBoardColumn, string> = {
  NEW: 'info',
  IN_WORK: 'warning',
  READY: 'success',
  WITH_COURIER: 'warning',
  HANDED_OFF: 'muted',
};

export const ORDER_BOARD_COLUMNS: OrderBoardColumn[] = [
  'NEW',
  'IN_WORK',
  'READY',
  'WITH_COURIER',
  'HANDED_OFF',
];

export function formatOrderTimeWindow(input: {
  readyAt: string | null;
  deliveryWindowStart: string | null;
  deliveryWindowEnd: string | null;
}): string {
  if (input.deliveryWindowStart && input.deliveryWindowEnd) {
    const start = new Date(input.deliveryWindowStart);
    const end = new Date(input.deliveryWindowEnd);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      const fmt = (d: Date) =>
        d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      return `${fmt(start)}–${fmt(end)}`;
    }
  }
  if (input.readyAt) {
    const d = new Date(input.readyAt);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }
  }
  return '—';
}

export function formatCalendarDayLabel(isoDate: string, todayIso: string): string {
  const d = new Date(`${isoDate}T12:00:00`);
  const weekday = d.toLocaleDateString('ru-RU', { weekday: 'short' });
  const day = d.getDate();
  if (isoDate === todayIso) return `сегодня, ${day}`;
  return `${weekday}, ${day}`;
}

export function formatDatePickerLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`);
  return d.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function formatDateStripWeekday(isoDate: string, todayIso: string): string {
  if (isoDate === todayIso) return 'Сегодня';
  const d = new Date(`${isoDate}T12:00:00`);
  return d.toLocaleDateString('ru-RU', { weekday: 'short' });
}

export function orderCardSortKey(card: OrderBoardCardDto): number {
  const iso = card.deliveryWindowStart ?? card.readyAt;
  if (!iso) return Number.MAX_SAFE_INTEGER;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? Number.MAX_SAFE_INTEGER : ms;
}

export function sortOrderBoardCards(a: OrderBoardCardDto, b: OrderBoardCardDto): number {
  const diff = orderCardSortKey(a) - orderCardSortKey(b);
  if (diff !== 0) return diff;
  return a.number.localeCompare(b.number);
}

export function orderCountByDate(
  dateCounts: Array<{ date: string; count: number }>,
): Map<string, number> {
  return new Map(dateCounts.map((row) => [row.date, row.count]));
}

export function orderCountForDate(
  dateCounts: Array<{ date: string; count: number }>,
  isoDate: string,
): number {
  return orderCountByDate(dateCounts).get(isoDate) ?? 0;
}

export function shiftIsoDate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function monthIsoFromDate(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export function shiftMonthIso(monthIso: string, delta: number): string {
  const parts = monthIso.split('-').map(Number);
  const year = parts[0] ?? 0;
  const month = parts[1] ?? 1;
  const d = new Date(year, month - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabelRu(monthIso: string): string {
  const parts = monthIso.split('-').map(Number);
  const year = parts[0] ?? 0;
  const month = parts[1] ?? 1;
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
}

export function buildMonthDays(monthIso: string): Array<{ date: string | null }> {
  const parts = monthIso.split('-').map(Number);
  const year = parts[0] ?? 0;
  const month = parts[1] ?? 1;
  const first = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0).getDate();
  const startDow = (first.getDay() + 6) % 7;
  const cells: Array<{ date: string | null }> = [];
  for (let i = 0; i < startDow; i += 1) {
    cells.push({ date: null });
  }
  for (let day = 1; day <= lastDay; day += 1) {
    cells.push({
      date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    });
  }
  return cells;
}

export function buildDateStrip(centerIso: string, radius = 3): string[] {
  const dates: string[] = [];
  for (let offset = -radius; offset <= radius; offset += 1) {
    dates.push(shiftIsoDate(centerIso, offset));
  }
  return dates;
}

export function paymentStatusLabel(status: string): string {
  switch (status) {
    case 'PAID':
      return 'Оплачено';
    case 'PARTIALLY_PAID':
      return 'Частично';
    default:
      return 'Не оплачено';
  }
}
