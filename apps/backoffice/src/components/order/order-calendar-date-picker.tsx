'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { CalendarIcon } from '@/components/order/order-calendar-icons';
import { OrderCalendarMonthGrid } from '@/components/order/order-calendar-month-grid';
import { formatDatePickerLabel } from '@/lib/order-calendar-labels';

type OrderCalendarDatePickerProps = {
  date: string;
  viewMonth: string;
  dateCounts: Array<{ date: string; count: number }>;
  onSelectDate: (date: string) => void;
  onChangeMonth: (month: string) => void;
};

export function OrderCalendarDatePicker({
  date,
  viewMonth,
  dateCounts,
  onSelectDate,
  onChangeMonth,
}: OrderCalendarDatePickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function pick(next: string) {
    onSelectDate(next);
    setOpen(false);
  }

  return (
    <div className={`order-calendar-date-picker${open ? ' order-calendar-date-picker--open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="order-calendar-date-picker__trigger"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={listboxId}
        onClick={() => setOpen((value) => !value)}
      >
        <CalendarIcon className="order-calendar-date-picker__icon" title="Календарь" />
        <span className="order-calendar-date-picker__label">{formatDatePickerLabel(date)}</span>
        <span className={`order-calendar-date-picker__chevron${open ? ' order-calendar-date-picker__chevron--open' : ''}`} aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div id={listboxId} className="order-calendar-date-picker__popover" role="dialog" aria-label="Выбор даты">
          <OrderCalendarMonthGrid
            compact
            month={viewMonth}
            selectedDate={date}
            dateCounts={dateCounts}
            onSelectDate={pick}
            onChangeMonth={onChangeMonth}
          />
        </div>
      ) : null}
    </div>
  );
}
