'use client';

import { useMemo } from 'react';
import { DatePicker } from '@/components/layout/date-picker';
import { TimePicker } from '@/components/layout/time-picker';

type ReadyAtFieldProps = {
  date: string;
  time: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  dateError?: string;
  timeError?: string;
};

function formatLocalDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

const DATE_PRESETS = [
  { id: 'today', label: 'Сегодня', offset: 0 },
  { id: 'tomorrow', label: 'Завтра', offset: 1 },
  { id: 'day-after', label: 'Послезавтра', offset: 2 },
] as const;

export function defaultReadyDate(): string {
  return formatLocalDate(new Date());
}

export function ReadyAtField({
  date,
  time,
  onDateChange,
  onTimeChange,
  required,
  disabled,
  dateError,
  timeError,
}: ReadyAtFieldProps) {
  const presetDates = useMemo(() => {
    const now = new Date();
    return DATE_PRESETS.map((preset) => ({
      ...preset,
      value: formatLocalDate(addDays(now, preset.offset)),
    }));
  }, []);

  return (
    <div className={`ready-at-field${disabled ? ' ready-at-field--disabled' : ''}`}>
      <div className="ready-at-field__dates">
        <span className="ready-at-field__section-label">Дата</span>
        <div className="ready-at-field__date-presets" role="group" aria-label="Дата">
          {presetDates.map((preset) => {
            const active = date === preset.value;
            return (
              <button
                key={preset.id}
                type="button"
                className={`ready-at-field__chip${active ? ' ready-at-field__chip--active' : ''}`}
                aria-pressed={active}
                disabled={disabled}
                onClick={() => onDateChange(preset.value)}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
        <DatePicker
          id="ready-at-date"
          value={date}
          onChange={onDateChange}
          required={required}
          disabled={disabled}
          className={`ready-at-field__date-input${dateError ? ' field-control--invalid' : ''}`}
          aria-label="Дата"
          placeholder="Выберите дату"
        />
        {dateError ? <span className="field__error">{dateError}</span> : null}
      </div>
      <div className="ready-at-field__time">
        <span className="ready-at-field__section-label">Время</span>
        <TimePicker
          value={time}
          onChange={onTimeChange}
          required={required}
          disabled={disabled}
        />
        {timeError ? <span className="field__error">{timeError}</span> : null}
      </div>
    </div>
  );
}
