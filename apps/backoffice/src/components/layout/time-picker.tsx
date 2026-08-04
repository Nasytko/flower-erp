'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';

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

function buildTimeSlots(): string[] {
  const slots: string[] = [];
  for (let hour = 8; hour <= 21; hour++) {
    for (const minute of [0, 30]) {
      if (hour === 21 && minute === 30) break;
      slots.push(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
    }
  }
  return slots;
}

const TIME_SLOTS = buildTimeSlots();

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
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const displayValue = value || '—:—';

  const panelTimes = useMemo(() => {
    if (!value || TIME_SLOTS.includes(value)) {
      return TIME_SLOTS;
    }
    return [...TIME_SLOTS, value].sort();
  }, [value]);

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onEsc(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  function pick(time: string) {
    onChange(time);
    setOpen(false);
  }

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

      <div className="time-picker__exact">
        <span className="time-picker__custom-label">Точное время</span>
        <div
          ref={rootRef}
          className={['fancy-select time-picker__dropdown', open ? 'fancy-select--open' : '']
            .filter(Boolean)
            .join(' ')}
        >
          <button
            type="button"
            id={inputId}
            className="fancy-select__trigger time-picker__trigger"
            disabled={disabled}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-label="Точное время"
            onClick={() => {
              if (!disabled) setOpen((current) => !current);
            }}
          >
            <span className="time-picker__icon" aria-hidden="true">
              <ClockIcon />
            </span>
            <span className={value ? 'fancy-select__value' : 'fancy-select__placeholder'}>
              {displayValue}
            </span>
            <span className="fancy-select__chevron" aria-hidden="true">
              ▾
            </span>
          </button>

          {required ? (
            <input
              tabIndex={-1}
              aria-hidden="true"
              required
              value={value}
              onChange={() => undefined}
              className="fancy-select__native"
            />
          ) : null}

          {open ? (
            <div className="fancy-select__panel time-picker__panel" role="presentation">
              <ul className="time-picker__panel-grid" role="listbox">
                {panelTimes.map((slot) => {
                  const active = value === slot;
                  return (
                    <li key={slot} role="option" aria-selected={active}>
                      <button
                        type="button"
                        className={[
                          'time-picker__panel-option',
                          active ? 'time-picker__panel-option--active' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() => pick(slot)}
                      >
                        {slot}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 8V12L15 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
