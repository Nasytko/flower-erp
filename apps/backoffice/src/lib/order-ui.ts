/** Simplified order lifecycle shown in backoffice (maps backend statuses). */
export type OrderPhase = 'NEW' | 'IN_WORK' | 'READY' | 'HANDED_OFF';

export const ORDER_PHASE_LABELS: Record<Exclude<OrderPhase, 'HANDED_OFF'>, string> = {
  NEW: 'Новый',
  IN_WORK: 'Взят в работу',
  READY: 'Готов',
};

export type OrderPhaseInput = {
  status: string;
  type?: string;
  hasActiveAssignment?: boolean;
  completedAt?: string | null;
  /** When API provides display phase, prefer it. */
  displayPhase?: OrderPhase | string;
  displayPhaseLabel?: string;
};

export type DeliveryPhaseInput = {
  status: string;
  handedOverAt?: string | null;
} | null;

export function resolveOrderPhase(
  order: OrderPhaseInput,
  delivery?: DeliveryPhaseInput,
): OrderPhase {
  if (order.displayPhase && isOrderPhase(order.displayPhase)) {
    return order.displayPhase;
  }
  if (order.status === 'CANCELLED') return 'NEW';
  if (order.status === 'DRAFT') return 'NEW';
  if (order.status === 'COMPLETED') return 'HANDED_OFF';
  if (delivery?.status === 'DELIVERED') return 'HANDED_OFF';
  if (order.status === 'READY') return 'READY';
  if (order.status === 'IN_PREPARATION' || order.hasActiveAssignment) return 'IN_WORK';
  return 'NEW';
}

function isOrderPhase(value: string): value is OrderPhase {
  return ['NEW', 'IN_WORK', 'READY', 'HANDED_OFF'].includes(value);
}

/** Human label; last step differs for delivery vs pickup. */
export function orderPhaseLabel(
  phase: OrderPhase,
  order?: Pick<OrderPhaseInput, 'type' | 'displayPhase'> & { displayPhaseLabel?: string },
): string {
  if (order?.displayPhaseLabel && order.displayPhase === phase) {
    return order.displayPhaseLabel;
  }
  if (phase === 'HANDED_OFF') {
    return order?.type === 'DELIVERY' ? 'Передан (доставка)' : 'Передан (самовывоз)';
  }
  return ORDER_PHASE_LABELS[phase];
}

export function orderLifecycleSteps(): OrderPhase[] {
  return ['NEW', 'IN_WORK', 'READY', 'HANDED_OFF'];
}

export function orderPhaseFromStatus(
  status: string | null | undefined,
  hasActiveAssignment = false,
): OrderPhase {
  if (!status) return 'NEW';
  return resolveOrderPhase({ status, hasActiveAssignment });
}

export function isOrderHeaderEditable(status: string): boolean {
  return ['DRAFT', 'CONFIRMED', 'PARTIALLY_RESERVED', 'RESERVED'].includes(status);
}

export type OrderListFilter =
  | 'ALL'
  | 'NEW'
  | 'IN_WORK'
  | 'READY'
  | 'HANDED_OFF'
  | 'HANDED_OFF_TODAY';

function isCompletedToday(completedAt?: string | null): boolean {
  if (!completedAt) return false;
  const d = new Date(completedAt);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function matchesOrderListFilter(
  order: OrderPhaseInput,
  delivery: DeliveryPhaseInput,
  filter: OrderListFilter,
): boolean {
  if (filter === 'ALL') return order.status !== 'CANCELLED';
  const phase = resolveOrderPhase(order, delivery);
  if (filter === 'HANDED_OFF') {
    return phase === 'HANDED_OFF';
  }
  if (filter === 'HANDED_OFF_TODAY') {
    return phase === 'HANDED_OFF' && isCompletedToday(order.completedAt);
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
