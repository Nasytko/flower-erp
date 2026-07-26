export const DELIVERY_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Черновик',
  PLANNED: 'Ожидает',
  READY_FOR_DISPATCH: 'К передаче',
  ASSIGNED: 'К передаче',
  IN_TRANSIT: 'Передали в доставку',
  DELIVERED: 'Доставили',
  PROBLEM: 'Проблема',
  CANCELLED: 'Отменена',
};

export const DELIVERY_METHOD_LABELS: Record<string, string> = {
  OWN_COURIER: 'Свой курьер',
  TAXI: 'Такси',
  THIRD_PARTY_SERVICE: 'Сторонний сервис',
};

export const DELIVERY_PROBLEM_TYPES = [
  'RECIPIENT_UNAVAILABLE',
  'WRONG_ADDRESS',
  'DELAY',
  'DAMAGED_ORDER',
  'PAYMENT_ISSUE',
  'COURIER_ISSUE',
  'OTHER',
] as const;

export const BOARD_SECTION_LABELS: Record<string, string> = {
  needsPlanning: 'Ожидают',
  withoutCourier: 'К передаче',
  orderPreparing: 'Ещё собирается',
  readyForDispatch: 'К передаче',
  assigned: 'К передаче',
  inTransit: 'Передали в доставку',
  problems: 'Проблемы',
  delivered: 'Доставили',
};

export function deliveryStatusLabel(status: string): string {
  return DELIVERY_STATUS_LABELS[status] ?? status;
}

export function deliveryMethodLabel(method: string): string {
  return DELIVERY_METHOD_LABELS[method] ?? method;
}

export function formatWindow(windowStart: string, windowEnd: string): string {
  const start = new Date(windowStart);
  const end = new Date(windowEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `${windowStart} – ${windowEnd}`;
  }
  return `${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}–${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** @deprecated Import from `@/lib/idempotency` */
export { newIdempotencyKey } from './idempotency';
