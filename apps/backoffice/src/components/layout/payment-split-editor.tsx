'use client';

import { Button } from '@flower/ui';
import { Field } from '@/components/layout/field';
import { MoneyBynInput, parseBynToApi } from '@/components/layout/money-byn-input';

export type PaymentMethodOption = {
  id: string;
  name: string;
  code?: string;
};

export type PaymentSplitLine = {
  key: string;
  methodId: string;
  amount: string;
};

function newLineKey() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `pay_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function createEmptyPaymentLine(methodId = ''): PaymentSplitLine {
  return { key: newLineKey(), methodId, amount: '' };
}

/** Sum of valid BYN amounts across split lines. */
export function sumPaymentSplit(lines: PaymentSplitLine[]): string | null {
  let total = 0;
  let any = false;
  for (const line of lines) {
    const amount = parseBynToApi(line.amount);
    if (!amount || !line.methodId) continue;
    any = true;
    total += Number(amount);
  }
  if (!any) return null;
  return total.toFixed(2);
}

/** Valid method+amount pairs ready for API. */
export function parsePaymentSplit(
  lines: PaymentSplitLine[],
): Array<{ methodId: string; amount: string }> {
  const out: Array<{ methodId: string; amount: string }> = [];
  for (const line of lines) {
    const amount = parseBynToApi(line.amount);
    if (!line.methodId || !amount) continue;
    out.push({ methodId: line.methodId, amount });
  }
  return out;
}

type PaymentSplitEditorProps = {
  methods: PaymentMethodOption[];
  lines: PaymentSplitLine[];
  onChange: (lines: PaymentSplitLine[]) => void;
  /** Expected total (e.g. sale net) — shown for orientation, not forced. */
  expectedAmount?: string | null;
  currencyLabel?: string;
  /** Soft requirement hint in tooltip. */
  required?: boolean;
  disabled?: boolean;
  label?: string;
};

/**
 * One or more payment rows (method + amount). Supports cash+card split
 * and partial pay now / remainder later.
 */
export function PaymentSplitEditor({
  methods,
  lines,
  onChange,
  expectedAmount,
  currencyLabel = 'BYN',
  required,
  disabled,
  label = 'Оплата',
}: PaymentSplitEditorProps) {
  const paid = sumPaymentSplit(lines);
  const expected = expectedAmount?.trim() || null;
  const expectedNum = expected ? Number(expected) : null;
  const paidNum = paid ? Number(paid) : null;
  const remainder =
    expectedNum != null && paidNum != null && !Number.isNaN(expectedNum) && !Number.isNaN(paidNum)
      ? (expectedNum - paidNum).toFixed(2)
      : null;

  function updateLine(key: string, patch: Partial<PaymentSplitLine>) {
    onChange(lines.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function addLine() {
    const used = new Set(lines.map((l) => l.methodId).filter(Boolean));
    const nextMethod = methods.find((m) => !used.has(m.id)) ?? methods[0];
    onChange([...lines, createEmptyPaymentLine(nextMethod?.id ?? '')]);
  }

  return (
    <div className="payment-split">
      <Field
        label={label}
        tooltip="Можно разбить: например карта сейчас и наличные при выдаче, или наличные + карта сразу. Каждый способ — отдельная строка."
        required={required}
        hint={
          methods.length === 0
            ? 'Нет активных способов оплаты. Добавьте их в настройках магазина.'
            : undefined
        }
      >
        <div className="payment-split__rows">
          {lines.map((line, index) => (
            <div key={line.key} className="payment-split__row">
              <select
                className="field-control"
                value={line.methodId}
                disabled={disabled || methods.length === 0}
                required={required && index === 0}
                aria-label={`Способ оплаты ${index + 1}`}
                onChange={(e) => updateLine(line.key, { methodId: e.target.value })}
              >
                <option value="">Способ оплаты</option>
                {methods.map((method) => (
                  <option key={method.id} value={method.id}>
                    {method.name}
                    {method.code ? ` (${method.code})` : ''}
                  </option>
                ))}
              </select>
              <MoneyBynInput
                value={line.amount}
                onChange={(amount) => updateLine(line.key, { amount })}
                required={required && index === 0}
                disabled={disabled}
                aria-label={`Сумма оплаты ${index + 1}`}
              />
              {lines.length > 1 ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={disabled}
                  onClick={() => onChange(lines.filter((row) => row.key !== line.key))}
                >
                  Удалить
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      </Field>

      <div className="payment-split__footer">
        <Button type="button" variant="secondary" disabled={disabled || methods.length === 0} onClick={addLine}>
          + Ещё способ оплаты
        </Button>
        <p className="payment-split__summary">
          {paid ? (
            <>
              Сейчас: <strong>{paid} {currencyLabel}</strong>
              {expected ? <> · к оплате {expected} {currencyLabel}</> : null}
              {remainder && Number(remainder) > 0.0001 ? (
                <> · остаток {remainder} {currencyLabel} можно принять позже</>
              ) : null}
              {remainder && Number(remainder) < -0.0001 ? (
                <> · переплата {Math.abs(Number(remainder)).toFixed(2)} {currencyLabel}</>
              ) : null}
            </>
          ) : (
            <>Укажите способ и сумму. Можно оплатить частично и добрать позже.</>
          )}
        </p>
      </div>
    </div>
  );
}
