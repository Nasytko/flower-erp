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

/** Shown above diff when the row refers to a line/item but that label did not change. */
const CONTEXT_FIELD_KEYS = ['itemName', 'itemCode', 'number'] as const;

/** Keys omitted from audit diffs (noise / internal ids). */
const HIDDEN_DIFF_KEYS = new Set([
  'id',
  'organizationId',
  'storeId',
  'warehouseId',
  'createdAt',
  'updatedAt',
  'requestId',
  'actorId',
  'entityId',
  'entityType',
]);

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
  recipientPhone: 'Телефон',
  plannedPrice: 'Цена',
  readyAt: 'Готовность',
  type: 'Тип',
  occasion: 'Повод',
  deliveryAddressLine: 'Адрес',
  deliveryCity: 'Город',
  itemCount: 'Позиций',
  receiptNumber: 'Приход',
  receiptId: 'Приход (id)',
  number: 'Номер',
  supplierId: 'Поставщик',
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

function valuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function diffKeys(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): string[] {
  const allKeys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].filter(
    (key) => !HIDDEN_DIFF_KEYS.has(key),
  );

  if (!before || !after) {
    const source = after ?? before;
    return allKeys.filter((key) => source?.[key] !== undefined);
  }

  return allKeys.filter(
    (key) => !CONTEXT_FIELD_KEYS.includes(key as (typeof CONTEXT_FIELD_KEYS)[number]),
  );
}

/** Returns only fields whose values differ between snapshots. */
export function pickChangedAuditFields(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): { before: Record<string, unknown> | null; after: Record<string, unknown> | null } {
  if (!before && !after) return { before: null, after: null };
  if (!before) {
    const afterOnly: Record<string, unknown> = {};
    for (const key of diffKeys(null, after)) {
      if (after![key] !== undefined) afterOnly[key] = after![key];
    }
    return { before: null, after: Object.keys(afterOnly).length ? afterOnly : after };
  }
  if (!after) {
    const beforeOnly: Record<string, unknown> = {};
    for (const key of diffKeys(before, null)) {
      if (before[key] !== undefined) beforeOnly[key] = before[key];
    }
    return { before: Object.keys(beforeOnly).length ? beforeOnly : before, after: null };
  }

  const changedBefore: Record<string, unknown> = {};
  const changedAfter: Record<string, unknown> = {};
  for (const key of diffKeys(before, after)) {
    const prev = before[key];
    const next = after[key];
    if (valuesEqual(prev, next)) continue;
    if (prev !== undefined) changedBefore[key] = prev;
    if (next !== undefined) changedAfter[key] = next;
  }

  return {
    before: Object.keys(changedBefore).length ? changedBefore : null,
    after: Object.keys(changedAfter).length ? changedAfter : null,
  };
}

/** Short label for line/document context when the name itself did not change. */
export function getAuditContextLabel(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): string | null {
  for (const key of CONTEXT_FIELD_KEYS) {
    const value = after?.[key] ?? before?.[key];
    if (typeof value === 'string' && value.trim()) {
      const { before: changedBefore, after: changedAfter } = pickChangedAuditFields(before, after);
      const changedKeys = new Set([
        ...Object.keys(changedBefore ?? {}),
        ...Object.keys(changedAfter ?? {}),
      ]);
      if (!changedKeys.has(key)) return value;
    }
  }
  return null;
}

/** Human-readable lines listing only changed fields. */
export function formatAuditDiffLines(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): string[] {
  const { before: changedBefore, after: changedAfter } = pickChangedAuditFields(before, after);
  const lines: string[] = [];
  const keys = new Set([
    ...Object.keys(changedBefore ?? {}),
    ...Object.keys(changedAfter ?? {}),
  ]);

  for (const key of keys) {
    const prev = changedBefore?.[key];
    const next = changedAfter?.[key];

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
  }

  return lines;
}
