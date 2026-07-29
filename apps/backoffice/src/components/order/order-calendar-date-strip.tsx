'use client';

import type { OrderBoardColumn } from '@flower/api-client';
import {
  buildDateStrip,
  formatCalendarDayLabel,
  ORDER_BOARD_COLUMN_LABELS,
} from '@/lib/order-calendar-labels';
import { todayIsoDate } from '@/lib/delivery-labels';

type OrderCalendarDateStripProps = {
  selectedDate: string;
  dateCounts: Array<{ date: string; count: number }>;
  onSelect: (date: string) => void;
};

export function OrderCalendarDateStrip({
  selectedDate,
  dateCounts,
  onSelect,
}: OrderCalendarDateStripProps) {
  const today = todayIsoDate();
  const dates = buildDateStrip(selectedDate, 3);
  const countByDate = new Map(dateCounts.map((row) => [row.date, row.count]));

  return (
    <div className="order-calendar-strip" role="tablist" aria-label="Дни календаря">
      {dates.map((date) => {
        const count = countByDate.get(date) ?? 0;
        const selected = date === selectedDate;
        return (
          <button
            key={date}
            type="button"
            role="tab"
            aria-selected={selected}
            className={`order-calendar-strip__day${selected ? ' order-calendar-strip__day--active' : ''}`}
            onClick={() => onSelect(date)}
          >
            <span className="order-calendar-strip__dot-row">
              {count > 0 ? (
                <span
                  className={`order-calendar-strip__dot${date === today ? ' order-calendar-strip__dot--today' : ''}`}
                  aria-hidden
                />
              ) : (
                <span className="order-calendar-strip__dot order-calendar-strip__dot--empty" aria-hidden />
              )}
            </span>
            <span className="order-calendar-strip__label">
              {formatCalendarDayLabel(date, today)}
            </span>
            {count > 0 ? (
              <span className="order-calendar-strip__count">{count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function OrderCalendarColumnHeader({
  column,
  count,
}: {
  column: OrderBoardColumn;
  count: number;
}) {
  return (
    <header className={`order-calendar-column__head order-calendar-column__head--${column.toLowerCase()}`}>
      <span>{ORDER_BOARD_COLUMN_LABELS[column]}</span>
      <span className="order-calendar-column__count">{count}</span>
    </header>
  );
}
