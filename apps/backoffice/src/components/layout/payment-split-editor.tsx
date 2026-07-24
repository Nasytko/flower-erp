'use client';

import { Button } from '@flower/ui';
import { Field } from '@/components/layout/field';
import { FancySelect, paymentMethodLabel } from '@/components/layout/fancy-select';
import { MoneyBynInput, parseBynToApi } from '@/components/layout/money-byn-input';

export type PaymentMethodOption = {
  id: string;
  name: string;
  code?: string;
  type?: string;
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
  expectedAmount?: string | null;
  currencyLabel?: string;
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

  const methodOptions = methods.map((method) => ({
    value: method.id,
    label: paymentMethodLabel(method),
    hint: method.code,
  }));

  function updateLine(key: string, patch: Partial<PaymentSplitLine>) {
    onChange(lines.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function addLine() {
    const used = new Set(lines.map((l) => l.methodId).filter(Boolean));
    const nextMethod = methods.find((m) => !used.has(m.id)) ?? methods[0];
    onChange([...lines, createEmptyPaymentLine(nextMethod?.id ?? '')]);
  }

  function fillRemainder(key: string) {
    if (expectedNum == null || Number.isNaN(expectedNum)) return;
    const others = lines
      .filter((row) => row.key !== key)
      .reduce((sum, row) => sum + Number(parseBynToApi(row.amount) ?? 0), 0);
    const left = Math.max(expectedNum - others, 0);
    updateLine(key, { amount: left.toFixed(2) });
  }

  return (
    <div className="payment-split">
      <Field
        label={label}
        tooltip="Можно разбить: например карта + наличные. Каждый способ — отдельная строка."
        required={required}
        hint={
          methods.length === 0
            ? 'Способы оплаты не загружены. Проверьте права payments или создайте их в настройках.'
            : undefined
        }
      >
        <div className="payment-split__rows">
          {lines.map((line, index) => (
            <div key={line.key} className="payment-split__row">
              <FancySelect
                value={line.methodId}
                onChange={(methodId) => updateLine(line.key, { methodId })}
                options={methodOptions}
                placeholder="Способ оплаты"
                disabled={disabled || methods.length === 0}
                required={required && index === 0}
                searchable={methodOptions.length > 5}
                aria-label={`Способ оплаты ${index + 1}`}
                className="payment-split__method"
              />
              <div className="payment-split__amount">
                <MoneyBynInput
                  value={line.amount}
                  onChange={(amount) => updateLine(line.key, { amount })}
                  required={required && index === 0}
                  disabled={disabled}
                  aria-label={`Сумма оплаты ${index + 1}`}
                />
                {expected && !line.amount ? (
                  <button
                    type="button"
                    className="payment-split__fill"
                    disabled={disabled}
                    onClick={() => fillRemainder(line.key)}
                  >
                    Вся сумма
                  </button>
                ) : null}
              </div>
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
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || methods.length === 0}
          onClick={addLine}
        >
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
