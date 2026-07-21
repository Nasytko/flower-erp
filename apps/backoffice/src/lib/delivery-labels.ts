export const DELIVERY_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Черновик',
  PLANNED: 'Запланирована',
  READY_FOR_DISPATCH: 'Готова к отправке',
  ASSIGNED: 'Назначена',
  IN_TRANSIT: 'В пути',
  DELIVERED: 'Доставлена',
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
  needsPlanning: 'Требуют планирования',
  withoutCourier: 'Без курьера',
  orderPreparing: 'Заказ готовится',
  readyForDispatch: 'Готовы к отправке',
  assigned: 'Назначены',
  inTransit: 'В пути',
  problems: 'Проблемы',
  delivered: 'Доставлены',
};

export function deliveryStatusLabel(status: string): string {
  return DELIVERY_STATUS_LABELS[status] ?? status;
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

export function newIdempotencyKey(prefix = 'dlv'): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
