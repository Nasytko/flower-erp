/** Simplified order lifecycle for UI (maps backend statuses). */
export type OrderDisplayPhase = 'NEW' | 'IN_WORK' | 'READY' | 'HANDED_OFF';

export type OrderDisplayPhaseInput = {
  status: string;
  type?: string;
  hasActiveAssignment?: boolean;
};

export type DeliveryDisplayPhaseInput = {
  status: string;
  handedOverAt?: Date | string | null;
} | null;

export function resolveOrderDisplayPhase(
  order: OrderDisplayPhaseInput,
  delivery?: DeliveryDisplayPhaseInput,
): OrderDisplayPhase {
  if (order.status === 'CANCELLED') return 'NEW';
  if (order.status === 'DRAFT') return 'NEW';
  if (order.status === 'COMPLETED') return 'HANDED_OFF';
  if (delivery?.status === 'DELIVERED') return 'HANDED_OFF';
  if (order.status === 'READY') return 'READY';
  if (order.status === 'IN_PREPARATION' || order.hasActiveAssignment) return 'IN_WORK';
  return 'NEW';
}

export function orderDisplayPhaseLabel(
  phase: OrderDisplayPhase,
  order?: Pick<OrderDisplayPhaseInput, 'type'>,
): string {
  switch (phase) {
    case 'NEW':
      return 'Новый';
    case 'IN_WORK':
      return 'Взят в работу';
    case 'READY':
      return 'Готов';
    case 'HANDED_OFF':
      return order?.type === 'DELIVERY' ? 'Передан (доставка)' : 'Передан (самовывоз)';
  }
}
