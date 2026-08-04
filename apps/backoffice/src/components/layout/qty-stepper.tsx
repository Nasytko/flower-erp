'use client';

import { useEffect, useState } from 'react';

type QtyStepperProps = {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  /** Shown on +/- buttons for per-application services (e.g. +1). */
  stepLabel?: string;
  min?: number;
  max?: number;
  'aria-label'?: string;
};

function clampQty(value: number, min: number, max?: number): number {
  let next = Math.max(min, Math.floor(value));
  if (!Number.isFinite(next)) next = min;
  if (max !== undefined) next = Math.min(max, next);
  return next;
}

function parseQtyInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}

export function QtyStepper({
  value,
  onChange,
  disabled,
  stepLabel,
  min = 0,
  max,
  'aria-label': ariaLabel = 'Количество',
}: QtyStepperProps) {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setDraft(String(value));
    }
  }, [value, focused]);

  function commit(raw: string) {
    const parsed = parseQtyInput(raw);
    if (parsed === null) {
      setDraft(String(value));
      return;
    }
    onChange(clampQty(parsed, min, max));
  }

  const decreaseLabel = stepLabel ? `Убрать ${stepLabel}` : 'Уменьшить';
  const increaseLabel = stepLabel ? `Добавить ${stepLabel}` : 'Увеличить';

  return (
    <div className="sale-qty">
      <button
        type="button"
        className="sale-qty__btn"
        onClick={() => onChange(clampQty(value - 1, min, max))}
        disabled={disabled || value <= min}
        aria-label={decreaseLabel}
      >
        {stepLabel ? `−${stepLabel}` : '−'}
      </button>
      <input
        className="sale-qty__input"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={focused ? draft : String(value)}
        onChange={(event) => setDraft(event.target.value.replace(/\D/g, ''))}
        onFocus={() => {
          setFocused(true);
          setDraft(String(value));
        }}
        onBlur={(event) => {
          setFocused(false);
          commit(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          }
        }}
        disabled={disabled}
        aria-label={ariaLabel}
      />
      <button
        type="button"
        className="sale-qty__btn"
        onClick={() => onChange(clampQty(value + 1, min, max))}
        disabled={disabled || (max !== undefined && value >= max)}
        aria-label={increaseLabel}
      >
        {stepLabel ? `+${stepLabel}` : '+'}
      </button>
    </div>
  );
}
