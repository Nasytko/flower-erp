import {
  orderDisplayPhaseLabel,
  resolveOrderDisplayPhase,
  type OrderDisplayPhase,
} from './order-display-phase';

export type OrderBoardColumn =
  | 'NEW'
  | 'IN_WORK'
  | 'READY'
  | 'WITH_COURIER'
  | 'HANDED_OFF'
  | 'CANCELLED';

export const ORDER_BOARD_COLUMN_LABELS: Record<OrderBoardColumn, string> = {
  NEW: 'Новые',
  IN_WORK: 'В сборке',
  READY: 'Собранные',
  WITH_COURIER: 'У курьера',
  HANDED_OFF: 'Завершённые',
  CANCELLED: 'Отменённые',
};

const COURIER_DELIVERY_STATUSES = new Set(['ASSIGNED', 'IN_TRANSIT']);

export function resolveOrderBoardColumn(input: {
  status: string;
  type: string;
  hasActiveAssignment: boolean;
  deliveryStatus: string | null;
}): OrderBoardColumn {
  if (input.status === 'CANCELLED') return 'CANCELLED';

  const delivery = input.deliveryStatus ? { status: input.deliveryStatus } : null;
  const phase = resolveOrderDisplayPhase(
    {
      status: input.status,
      type: input.type,
      hasActiveAssignment: input.hasActiveAssignment,
    },
    delivery,
  );

  if (phase === 'HANDED_OFF') return 'HANDED_OFF';
  if (
    input.type === 'DELIVERY' &&
    input.deliveryStatus &&
    COURIER_DELIVERY_STATUSES.has(input.deliveryStatus)
  ) {
    return 'WITH_COURIER';
  }
  if (phase === 'READY') return 'READY';
  if (phase === 'IN_WORK') return 'IN_WORK';
  return 'NEW';
}

export function boardColumnForPhase(phase: OrderDisplayPhase): OrderBoardColumn {
  if (phase === 'HANDED_OFF') return 'HANDED_OFF';
  if (phase === 'READY') return 'READY';
  if (phase === 'IN_WORK') return 'IN_WORK';
  return 'NEW';
}

export function orderBoardDisplayLabel(
  column: OrderBoardColumn,
  type: string,
): string {
  if (column === 'HANDED_OFF') {
    return orderDisplayPhaseLabel('HANDED_OFF', { type });
  }
  return ORDER_BOARD_COLUMN_LABELS[column];
}
