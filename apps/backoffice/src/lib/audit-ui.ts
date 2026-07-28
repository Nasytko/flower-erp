export type AuditEntry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorId: string | null;
  actorDisplayName: string | null;
  reason: string | null;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  createdAt: string;
};

const ACTION_LABELS: Record<string, string> = {
  'supply.created': 'Приёмка создана',
  'supply.header_updated': 'Документ изменён',
  'supply.line_added': 'Позиция добавлена',
  'supply.line_removed': 'Позиция удалена',
  'supply.line_updated': 'Позиция изменена',
  'supply.line_corrected': 'Позиция исправлена после проведения',
  'supply.received': 'Проведена на склад',
  'supply.annulled': 'Приёмка аннулирована',
  ORDER_CREATED: 'Заказ создан',
  ORDER_UPDATED: 'Заказ изменён',
  ORDER_CONFIRMED: 'Заказ подтверждён',
  COMPOSITION_CHANGED: 'Состав изменён',
  ORDER_COMPLETED: 'Заказ завершён',
  ORDER_CANCELLED: 'Заказ отменён',
  ORDER_MARKED_READY: 'Заказ готов',
  ORDER_PREPARATION_STARTED: 'Начата сборка',
  SALE_CREATED: 'Продажа создана',
  SALE_COMPLETED: 'Продажа проведена',
  SALE_ANNULLED: 'Продажа аннулирована',
  PAYMENT_CREATED: 'Платёж создан',
  PAYMENT_COMPLETED: 'Платёж проведён',
  PAYMENT_ANNULLED: 'Платёж аннулирован',
};

export function auditActionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export function formatAuditWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

const FIELD_LABELS: Record<string, string> = {
  quantity: 'Кол-во',
  unitCost: 'Себестоимость',
  total: 'Сумма',
  itemName: 'Товар',
  itemCode: 'Код',
  receivedDate: 'Дата прихода',
  paymentDueDate: 'Оплатить до',
  supplierDocumentNumber: 'Номер накладной',
  comment: 'Комментарий',
  status: 'Статус',
  recipientName: 'Получатель',
  plannedPrice: 'Цена',
};

function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Human-readable diff lines for structured audit snapshots. */
export function formatAuditDiffLines(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): string[] {
  const lines: string[] = [];
  const keys = new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);

  for (const key of keys) {
    const prev = before?.[key];
    const next = after?.[key];
    if (JSON.stringify(prev) === JSON.stringify(next)) continue;

    if (prev !== undefined && next !== undefined) {
      lines.push(`${fieldLabel(key)}: ${formatValue(prev)} → ${formatValue(next)}`);
    } else if (next !== undefined) {
      lines.push(`${fieldLabel(key)}: ${formatValue(next)}`);
    } else if (prev !== undefined) {
      lines.push(`${fieldLabel(key)}: ${formatValue(prev)} → —`);
    }
  }

  if (lines.length === 0 && (before || after)) {
    if (before && !after) lines.push('Удалено');
    else if (!before && after) lines.push('Добавлено');
    else lines.push('Изменено');
  }

  return lines;
}

export function formatAuditSide(state: Record<string, unknown> | null): string {
  if (!state) return '—';
  if (state.itemName && (state.quantity || state.unitCost)) {
    const qty = state.quantity ?? '—';
    const cost = state.unitCost != null ? `${state.unitCost} BYN` : '—';
    const total = state.total != null ? ` = ${state.total} BYN` : '';
    return `${state.itemName}: ${qty} × ${cost}${total}`;
  }
  const lines = formatAuditDiffLines(null, state);
  return lines.length > 0 ? lines.join('; ') : formatValue(state);
}
