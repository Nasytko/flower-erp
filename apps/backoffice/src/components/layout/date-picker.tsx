'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const;

const MONTHS = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
] as const;

type DatePickerProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  className?: string;
  placeholder?: string;
  'aria-label'?: string;
  min?: string;
  max?: string;
};

export function formatIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatDateDisplay(iso: string): string {
  if (!iso) return '';
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) return iso;
  return `${day}.${month}.${year}`;
}

function parseIsoDate(iso: string): Date | null {
  if (!iso) return null;
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return null;
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
    return null;
  }
  return d;
}

function isBeforeIso(a: string, b: string): boolean {
  return a < b;
}

function isAfterIso(a: string, b: string): boolean {
  return a > b;
}

type CalendarCell = {
  iso: string;
  label: number;
  inMonth: boolean;
  disabled: boolean;
};

function buildCalendarCells(viewYear: number, viewMonth: number, min?: string, max?: string): CalendarCell[] {
  const first = new Date(viewYear, viewMonth, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const gridStart = new Date(viewYear, viewMonth, 1 - startOffset);
  const cells: CalendarCell[] = [];

  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    const iso = formatIsoDate(d);
    const disabled =
      (min ? isBeforeIso(iso, min) : false) || (max ? isAfterIso(iso, max) : false);
    cells.push({
      iso,
      label: d.getDate(),
      inMonth: d.getMonth() === viewMonth,
      disabled,
    });
  }

  return cells;
}

export function DatePicker({
  value,
  onChange,
  disabled,
  required,
  id,
  className,
  placeholder = 'Выберите дату',
  'aria-label': ariaLabel,
  min,
  max,
}: DatePickerProps) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const selectedDate = parseIsoDate(value);
  const todayIso = formatIsoDate(new Date());

  const initialView = selectedDate ?? new Date();
  const [viewYear, setViewYear] = useState(initialView.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialView.getMonth());

  useEffect(() => {
    const parsed = parseIsoDate(value);
    if (!parsed) return;
    setViewYear(parsed.getFullYear());
    setViewMonth(parsed.getMonth());
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

  const cells = useMemo(
    () => buildCalendarCells(viewYear, viewMonth, min, max),
    [viewYear, viewMonth, min, max],
  );

  function pick(iso: string) {
    onChange(iso);
    setOpen(false);
  }

  function shiftMonth(delta: number) {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }

  return (
    <div
      ref={rootRef}
      className={['fancy-select date-picker', open ? 'fancy-select--open' : '', className]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        type="button"
        id={inputId}
        className="fancy-select__trigger date-picker__trigger"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => {
          if (!disabled) setOpen((current) => !current);
        }}
      >
        <span className="date-picker__icon" aria-hidden="true">
          <CalendarIcon />
        </span>
        <span className={value ? 'fancy-select__value' : 'fancy-select__placeholder'}>
          {value ? formatDateDisplay(value) : placeholder}
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
        <div className="fancy-select__panel date-picker__panel" role="dialog" aria-label={ariaLabel ?? 'Календарь'}>
          <div className="date-picker__header">
            <button type="button" className="date-picker__nav" onClick={() => shiftMonth(-1)} aria-label="Предыдущий месяц">
              ‹
            </button>
            <span className="date-picker__title">
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <button type="button" className="date-picker__nav" onClick={() => shiftMonth(1)} aria-label="Следующий месяц">
              ›
            </button>
          </div>

          <div className="date-picker__weekdays" aria-hidden="true">
            {WEEKDAYS.map((day) => (
              <span key={day} className="date-picker__weekday">
                {day}
              </span>
            ))}
          </div>

          <div className="date-picker__grid" role="grid">
            {cells.map((cell) => {
              const isSelected = value === cell.iso;
              const isToday = cell.iso === todayIso;
              return (
                <button
                  key={cell.iso}
                  type="button"
                  role="gridcell"
                  disabled={cell.disabled}
                  className={[
                    'date-picker__day',
                    !cell.inMonth ? 'date-picker__day--outside' : '',
                    isSelected ? 'date-picker__day--selected' : '',
                    isToday ? 'date-picker__day--today' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => pick(cell.iso)}
                >
                  {cell.label}
                </button>
              );
            })}
          </div>

          <div className="date-picker__footer">
            <button type="button" className="date-picker__footer-btn" onClick={() => pick(todayIso)}>
              Сегодня
            </button>
            {value ? (
              <button
                type="button"
                className="date-picker__footer-btn date-picker__footer-btn--muted"
                onClick={() => {
                  onChange('');
                  setOpen(false);
                }}
              >
                Очистить
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="5" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 10H21" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 3V7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M16 3V7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
