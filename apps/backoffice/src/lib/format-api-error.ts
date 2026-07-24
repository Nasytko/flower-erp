import { ApiClientError } from '@flower/api-client';

const CODE_MESSAGES_RU: Record<string, string> = {
  SALE_EMPTY: 'Добавьте хотя бы одну позицию в продажу',
  INVALID_QUANTITY: 'Количество должно быть больше нуля',
  INVALID_UNIT_PRICE: 'Цена не может быть отрицательной',
  WAREHOUSE_NOT_FOUND: 'Склад магазина не найден. Создайте склад в настройках магазина',
  ITEM_NOT_FOUND: 'Товар не найден в справочнике',
  ITEM_ARCHIVED: 'Нельзя использовать архивный товар',
  FORBIDDEN: 'Недостаточно прав для этого действия',
  UNAUTHORIZED: 'Сессия истекла — войдите снова',
  VALIDATION: 'Проверьте заполнение формы',
  BAD_REQUEST: 'Запрос отклонён — проверьте данные',
  CONFLICT: 'Конфликт данных — обновите страницу и попробуйте снова',
  NOT_FOUND: 'Объект не найден',
  INTERNAL_ERROR: 'Внутренняя ошибка сервера. Попробуйте ещё раз',
  HTTP_ERROR: 'Ошибка связи с сервером',
};

/** Translate class-validator / Nest detail strings into RU. */
function translateDetail(raw: string): string {
  const text = raw.trim();
  const lower = text.toLowerCase();

  if (lower.includes('warehouseid') && (lower.includes('uuid') || lower.includes('must be'))) {
    return 'Не указан склад магазина (или указан неверно)';
  }
  if (lower.includes('itemid') && (lower.includes('uuid') || lower.includes('must be'))) {
    return 'Выберите товар или цветок из списка';
  }
  if (lower.includes('methodid') && (lower.includes('uuid') || lower.includes('must be'))) {
    return 'Выберите способ оплаты';
  }
  if (lower.includes('lines') && lower.includes('should not be empty')) {
    return 'Добавьте хотя бы одну позицию';
  }
  if (lower.includes('quantity')) {
    return 'Проверьте количество';
  }
  if (lower.includes('unitprice') || lower.includes('unit price') || lower.includes('amount')) {
    return 'Проверьте сумму / цену';
  }
  if (lower.includes('must be a uuid')) {
    return 'Некорректный идентификатор в запросе';
  }
  if (lower.includes('should not be empty') || lower.includes('must be a string')) {
    return text;
  }
  return text;
}

function detailsToMessages(details: unknown[]): string[] {
  const out: string[] = [];
  for (const row of details) {
    if (typeof row === 'string' && row.trim()) {
      out.push(translateDetail(row));
      continue;
    }
    if (row && typeof row === 'object') {
      const obj = row as Record<string, unknown>;
      if (typeof obj.message === 'string') {
        out.push(translateDetail(obj.message));
        continue;
      }
      if (Array.isArray(obj.constraints)) {
        for (const c of obj.constraints) {
          if (typeof c === 'string') out.push(translateDetail(c));
        }
        continue;
      }
      if (obj.constraints && typeof obj.constraints === 'object') {
        for (const c of Object.values(obj.constraints)) {
          if (typeof c === 'string') out.push(translateDetail(c));
        }
      }
    }
  }
  return [...new Set(out)];
}

export type FormattedError = {
  title: string;
  message: string;
  details: string[];
};

/**
 * Turn any thrown value into a user-facing RU error.
 * Prefer this over raw `err.message` in catch blocks.
 */
export function formatApiError(
  err: unknown,
  fallback = 'Не удалось выполнить действие',
): FormattedError {
  if (err instanceof ApiClientError) {
    const details = detailsToMessages(err.details);
    const mapped = CODE_MESSAGES_RU[err.code];
    const isGeneric =
      !err.message ||
      err.message === 'Validation failed' ||
      err.message === 'Unexpected server error' ||
      err.message.startsWith('HTTP ');

    let message: string;
    if (!isGeneric) {
      message = err.message;
    } else if (details.length === 1) {
      message = details[0]!;
    } else if (mapped) {
      message = mapped;
    } else if (details.length > 0) {
      message = 'Проверьте данные формы';
    } else {
      message = fallback;
    }

    return {
      title: isGeneric && details.length > 0 ? 'Проверьте форму' : 'Не удалось выполнить',
      message,
      details: details.length > 1 || (details.length === 1 && details[0] !== message) ? details : [],
    };
  }

  if (err instanceof Error && err.message.trim()) {
    return { title: 'Ошибка', message: err.message, details: [] };
  }

  return { title: 'Ошибка', message: fallback, details: [] };
}

/** Single-line message for simple `setError(string)` call sites. */
export function formatApiErrorMessage(err: unknown, fallback?: string): string {
  const formatted = formatApiError(err, fallback);
  if (formatted.details.length === 0) return formatted.message;
  return `${formatted.message}: ${formatted.details.join('; ')}`;
}
