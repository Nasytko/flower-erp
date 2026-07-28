'use client';

import { useId } from 'react';
import { Input } from '@flower/ui';

const PRESET_TIMES = [
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
  '18:00',
  '19:00',
  '20:00',
] as const;

type TimePickerProps = {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  id?: string;
  disabled?: boolean;
};

export function TimePicker({ value, onChange, required, id, disabled }: TimePickerProps) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;

  return (
    <div className="time-picker">
      <div className="time-picker__presets" role="group" aria-label="Быстрый выбор времени">
        {PRESET_TIMES.map((preset) => {
          const active = value === preset;
          return (
            <button
              key={preset}
              type="button"
              className={`time-picker__chip${active ? ' time-picker__chip--active' : ''}`}
              aria-pressed={active}
              disabled={disabled}
              onClick={() => onChange(preset)}
            >
              {preset}
            </button>
          );
        })}
      </div>
      <Input
          id={inputId}
          type="time"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          disabled={disabled}
          className="time-picker__input"
          aria-label="Время"
        />
    </div>
  );
}
