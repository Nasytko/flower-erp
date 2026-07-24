'use client';

import type { InputHTMLAttributes } from 'react';
import { Input } from '@flower/ui';

type MoneyBynInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: string;
  onChange: (value: string) => void;
};

/** Normalize user input to a BYN decimal string (rubles.copecks). */
export function normalizeBynInput(raw: string): string {
  const cleaned = raw.replace(/\s/g, '').replace(',', '.');
  if (!cleaned) return '';
  // Allow typing "45." / "45.5" while editing
  if (/^\d+\.$/.test(cleaned) || /^\d+\.\d$/.test(cleaned)) return cleaned;
  const match = cleaned.match(/^\d+(?:\.\d{0,2})?/);
  return match?.[0] ?? '';
}

export function formatBynAmount(value: string): string {
  const normalized = normalizeBynInput(value);
  if (!normalized || normalized.endsWith('.')) return normalized;
  const num = Number(normalized);
  if (!Number.isFinite(num)) return normalized;
  return num.toFixed(2);
}

export function parseBynToApi(value: string): string | null {
  const formatted = formatBynAmount(value.trim());
  if (!formatted || formatted.endsWith('.')) return null;
  const num = Number(formatted);
  if (!Number.isFinite(num) || num < 0) return null;
  return num.toFixed(2);
}

export function MoneyBynInput({ value, onChange, onBlur, ...props }: MoneyBynInputProps) {
  return (
    <div className="money-byn">
      <Input
        {...props}
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(normalizeBynInput(event.target.value))}
        onBlur={(event) => {
          onChange(formatBynAmount(event.target.value));
          onBlur?.(event);
        }}
        placeholder={props.placeholder ?? '0.00'}
        aria-describedby={props['aria-describedby']}
      />
      <span className="money-byn__currency" aria-hidden="true">
        BYN
      </span>
    </div>
  );
}
