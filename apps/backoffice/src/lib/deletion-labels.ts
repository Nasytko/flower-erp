import type { DeletionEntityType } from '@flower/api-client';

export const DELETION_ENTITY_LABELS_RU: Record<DeletionEntityType, string> = {
  ITEM: 'Товар',
  SUPPLIER: 'Поставщик',
  CATEGORY: 'Категория',
  INVENTORY_POLICY: 'Политика учёта',
  CUSTOMER: 'Клиент',
  USER: 'Сотрудник',
  COURIER: 'Курьер',
  PAYMENT_METHOD: 'Способ оплаты',
};

export const DELETION_STATUS_LABELS_RU: Record<string, string> = {
  PENDING: 'Ожидает',
  APPROVED: 'Удалено',
  REJECTED: 'Отклонено',
  CANCELLED: 'Отменено',
};
