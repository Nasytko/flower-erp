'use client';

import {
  buildMonthDays,
  monthLabelRu,
  shiftMonthIso,
} from '@/lib/order-calendar-labels';
import { todayIsoDate } from '@/lib/delivery-labels';

const WEEKDAY_LABELS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

type OrderCalendarMonthGridProps = {
  month: string;
  selectedDate: string;
  dateCounts: Array<{ date: string; count: number }>;
  onSelectDate: (date: string) => void;
  onChangeMonth: (month: string) => void;
  compact?: boolean;
};

export function OrderCalendarMonthGrid({
  month,
  selectedDate,
  dateCounts,
  onSelectDate,
  onChangeMonth,
  compact = false,
}: OrderCalendarMonthGridProps) {
  const today = todayIsoDate();
  const countByDate = new Map(dateCounts.map((row) => [row.date, row.count]));
  const days = buildMonthDays(month);

  return (
    <div className={`order-calendar-month${compact ? ' order-calendar-month--compact' : ''}`}>
      <div className="order-calendar-month__head">
        <button type="button" className="order-calendar-month__nav" onClick={() => onChangeMonth(shiftMonthIso(month, -1))}>
          ←
        </button>
        <strong className="order-calendar-month__title">{monthLabelRu(month)}</strong>
        <button type="button" className="order-calendar-month__nav" onClick={() => onChangeMonth(shiftMonthIso(month, 1))}>
          →
        </button>
      </div>
      <div className="order-calendar-month__weekdays" aria-hidden>
        {WEEKDAY_LABELS.map((label) => (
          <span key={label} className="order-calendar-month__weekday">
            {label}
          </span>
        ))}
      </div>
      <div className="order-calendar-month__grid" role="grid" aria-label="Календарь месяца">
        {days.map((cell, index) => {
          if (!cell.date) {
            return <span key={`empty-${index}`} className="order-calendar-month__cell order-calendar-month__cell--empty" />;
          }
          const count = countByDate.get(cell.date) ?? 0;
          const selected = cell.date === selectedDate;
          const isToday = cell.date === today;
          const dayNum = Number(cell.date.slice(8, 10));
          return (
            <button
              key={cell.date}
              type="button"
              role="gridcell"
              aria-selected={selected}
              className={`order-calendar-month__cell${selected ? ' order-calendar-month__cell--selected' : ''}${isToday ? ' order-calendar-month__cell--today' : ''}`}
              onClick={() => onSelectDate(cell.date!)}
            >
              <span className="order-calendar-month__day">{dayNum}</span>
              {count > 0 ? (
                <span className="order-calendar-month__dots" aria-label={`${count} заказов`}>
                  {count <= 3
                    ? Array.from({ length: count }, (_, i) => (
                        <span key={i} className="order-calendar-month__dot" />
                      ))
                    : (
                        <span className="order-calendar-month__dot order-calendar-month__dot--many">{count}</span>
                      )}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
