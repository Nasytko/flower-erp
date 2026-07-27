/** Simplified order lifecycle shown in backoffice (maps backend statuses). */
export type OrderPhase = 'NEW' | 'ASSEMBLED' | 'IN_DELIVERY' | 'COMPLETED';

export const ORDER_PHASE_LABELS: Record<OrderPhase, string> = {
  NEW: 'Новый',
  ASSEMBLED: 'Собран',
  IN_DELIVERY: 'Передан в доставку',
  COMPLETED: 'Выполнен',
};

export type OrderPhaseInput = {
  status: string;
  type?: string;
};

export type DeliveryPhaseInput = {
  status: string;
  handedOverAt?: string | null;
} | null;

export function resolveOrderPhase(
  order: OrderPhaseInput,
  delivery?: DeliveryPhaseInput,
): OrderPhase {
  if (order.status === 'CANCELLED') return 'NEW';
  if (order.status === 'COMPLETED') return 'COMPLETED';
  if (delivery?.status === 'DELIVERED') return 'COMPLETED';
  if (
    delivery &&
    (delivery.status === 'IN_TRANSIT' ||
      delivery.handedOverAt ||
      delivery.status === 'READY_FOR_DISPATCH')
  ) {
    if (delivery.status === 'IN_TRANSIT' || delivery.handedOverAt) return 'IN_DELIVERY';
  }
  if (order.status === 'READY') return 'ASSEMBLED';
  return 'NEW';
}

export function orderPhaseLabel(phase: OrderPhase): string {
  return ORDER_PHASE_LABELS[phase];
}

export function orderPhaseFromStatus(status: string | null | undefined): OrderPhase {
  if (!status) return 'NEW';
  if (status === 'COMPLETED') return 'COMPLETED';
  if (status === 'READY') return 'ASSEMBLED';
  if (status === 'CANCELLED') return 'NEW';
  return 'NEW';
}

export type OrderListFilter = 'ALL' | 'NEW' | 'ASSEMBLED' | 'IN_DELIVERY' | 'COMPLETED';

export function matchesOrderListFilter(
  order: OrderPhaseInput,
  delivery: DeliveryPhaseInput,
  filter: OrderListFilter,
): boolean {
  if (filter === 'ALL') return order.status !== 'CANCELLED';
  const phase = resolveOrderPhase(order, delivery);
  if (filter === 'COMPLETED') {
    return phase === 'COMPLETED' || order.status === 'CANCELLED';
  }
  return phase === filter;
}

export function combineDateAndTime(date: string, time: string): string {
  return new Date(`${date}T${time}`).toISOString();
}

export function splitReadyAt(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: '', time: '12:00' };
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

export function formatReadyAt(iso: string | null | undefined): string {
  if (!iso) return 'не указано';
  const { date, time } = splitReadyAt(iso);
  const [y, m, d] = date.split('-');
  return `${d}.${m}.${y} ${time}`;
}
