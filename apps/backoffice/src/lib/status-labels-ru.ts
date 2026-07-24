/** Russian labels for domain status codes shown in StatusBadge. */
export const STATUS_LABELS_RU: Record<string, string> = {
  // Common / master data
  ACTIVE: 'Активно',
  active: 'Активно',
  INACTIVE: 'Неактивно',
  ARCHIVED: 'В архиве',
  archived: 'В архиве',
  DEFAULT: 'По умолчанию',
  DRAFT: 'Черновик',
  draft: 'Черновик',
  POSTED: 'Проведено',
  CANCELLED: 'Отменено',
  READY: 'Готово',
  ready: 'Готово',
  COMPLETED: 'Завершено',
  ANNULLED: 'Аннулировано',
  CONFIRMED: 'Подтверждено',
  SUBMITTED_TO_SUPPLIER: 'Отправлено поставщику',
  PARTIALLY_RECEIVED: 'Частично принято',
  RECEIVED: 'Принято',

  // Orders / workspace
  RESERVED: 'Зарезервировано',
  PARTIALLY_RESERVED: 'Частичный резерв',
  IN_PREPARATION: 'В подготовке',
  OVERDUE: 'Просрочено',
  DEFICIT: 'Нехватка',
  UNASSIGNED: 'Без назначения',

  // Item types / policies
  FLOWER: 'Цветок',
  MATERIAL: 'Материал',
  LOT: 'Партия',
  NONE: 'Нет',
  WAREHOUSE: 'Склад',

  // Sales
  DIRECT: 'Сборный букет',
  ORDER_BASED: 'Из заказа',
  STORE: 'Магазин',
  WEBSITE: 'Сайт',
  PHONE: 'Телефон',
  TELEGRAM: 'Телеграм',
  OTHER: 'Другое',
  POS: 'Касса',
  PROMOTION: 'Акция',
  LOYAL_CUSTOMER: 'Постоянный клиент',
  AGED_FLOWERS: 'Цветы с уценкой',
  MANAGER_DECISION: 'Решение менеджера',
  PERCENT: 'Процент',
  FIXED: 'Фиксированная',

  // Sale inventory source
  ORDER_ACTUAL_COMPOSITION: 'Состав заказа',
  DIRECT_COMPOSITION: 'Состав букета',

  // Payments
  UNPAID: 'Не оплачено',
  PARTIALLY_PAID: 'Частично оплачено',
  PAID: 'Оплачено',
  OVERPAID: 'Переплата',
  REFUNDED: 'Возврат',
  PARTIALLY_REFUNDED: 'Частичный возврат',

  // Sale timeline
  SALE_CREATED: 'Создана',
  SALE_COMPLETED: 'Завершена',
  SALE_ANNULLED: 'Аннулирована',
  SALE_UPDATED: 'Обновлена',
  SALE_PAYMENT_ADDED: 'Добавлена оплата',
  SALE_DISCOUNT_APPLIED: 'Применена скидка',

  // Delivery (shared badge)
  PLANNED: 'Запланировано',
  READY_FOR_DISPATCH: 'К отправке',
  ASSIGNED: 'Назначено',
  IN_TRANSIT: 'В пути',
  DELIVERED: 'Доставлено',
  PROBLEM: 'Проблема',
};

const TIMELINE_MESSAGE_RU: Record<string, string> = {
  'Sale created from order': 'Продажа создана из заказа',
  'Direct sale created': 'Создана продажа сборного букета',
  'Sale completed': 'Продажа завершена',
  'Sale annulled': 'Продажа аннулирована',
};

export function statusLabelRu(status: string): string {
  return STATUS_LABELS_RU[status] ?? status;
}

export function timelineMessageRu(message: string | null | undefined): string | null {
  if (!message) return null;
  return TIMELINE_MESSAGE_RU[message] ?? message;
}
