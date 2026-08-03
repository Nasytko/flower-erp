import { DELIVERY_STATUS_LABELS } from './delivery-labels';

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
  PENDING: 'Ожидает',
  APPROVED: 'Удалено',
  REJECTED: 'Отклонено',
  CONFIRMED: 'Подтверждено',
  SUBMITTED_TO_SUPPLIER: 'К оприходованию',
  PARTIALLY_RECEIVED: 'Оприходовано',
  RECEIVED: 'Оприходовано',

  // Orders / workspace
  RESERVED: 'Зарезервировано',
  PARTIALLY_RESERVED: 'Частичный резерв',
  IN_PREPARATION: 'Собирается',
  OVERDUE: 'Просрочено',
  DEFICIT: 'Нехватка',
  UNASSIGNED: 'Без назначения',
  ASSEMBLING: 'Собирается',
  IN_DELIVERY: 'Передали в доставку',
  HANDED_OVER: 'Передали в доставку',

  // Item types / policies
  FLOWER: 'Цветок',
  MATERIAL: 'Материал',
  LOT: 'Партия',
  NONE: 'Нет',
  WAREHOUSE: 'Склад',

  // Sales
  DIRECT: 'В магазине',
  ORDER_BASED: 'Из заказа',
  PICKUP: 'Самовывоз',
  DELIVERY: 'Доставка',
  STORE: 'Магазин',
  WEBSITE: 'Сайт',
  PHONE: 'Телефон',
  OTHER: 'Другое',
  POS: 'Касса',
  PROMOTION: 'Акция',
  LOYAL_CUSTOMER: 'Постоянный клиент',
  AGED_FLOWERS: 'Цветы с уценкой',
  MANAGER_DECISION: 'Решение менеджера',
  PERCENT: 'Процент',
  FIXED: 'Фиксированная',

  // Order occasions
  BIRTHDAY: 'День рождения',
  WEDDING: 'Свадьба',
  ROMANTIC: 'Романтика',
  CORPORATE: 'Корпоратив',
  FUNERAL: 'Траур',
  MOTHER_DAY: 'День матери',
  NEW_YEAR: 'Новый год',

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
};

export const ROLE_LABELS_RU: Record<string, string> = {
  DIRECTOR: 'Директор',
  DEVELOPER: 'Разработчик',
  FLORIST: 'Флорист',
  COURIER: 'Курьер',
};

export const USER_STATUS_LABELS_RU: Record<string, string> = {
  ACTIVE: 'Активен',
  BLOCKED: 'Заблокирован',
  ARCHIVED: 'В архиве',
  SUSPENDED: 'Приостановлен',
};

const DELIVERY_STATUS_CODES = new Set(Object.keys(DELIVERY_STATUS_LABELS));

export function statusLabelRu(status: string): string {
  if (DELIVERY_STATUS_CODES.has(status)) {
    return DELIVERY_STATUS_LABELS[status] ?? status;
  }
  return USER_STATUS_LABELS_RU[status] ?? STATUS_LABELS_RU[status] ?? status;
}
