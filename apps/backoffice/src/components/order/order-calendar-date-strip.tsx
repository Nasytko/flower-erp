'use client';

import type { OrderBoardColumn } from '@flower/api-client';
import { OrdersCountIcon } from '@/components/order/order-calendar-icons';
import {
  buildDateStrip,
  formatDateStripWeekday,
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
        const isToday = date === today;
        const dayNum = Number(date.slice(8, 10));

        return (
          <button
            key={date}
            type="button"
            role="tab"
            aria-selected={selected}
            className={`order-calendar-strip__day${selected ? ' order-calendar-strip__day--active' : ''}${isToday ? ' order-calendar-strip__day--today' : ''}`}
            onClick={() => onSelect(date)}
          >
            <span className="order-calendar-strip__weekday">
              {formatDateStripWeekday(date, today)}
            </span>
            <span className="order-calendar-strip__daynum">{dayNum}</span>
            {count > 0 ? (
              <span className="order-calendar-strip__badge" aria-label={`${count} заказов`}>
                <OrdersCountIcon className="order-calendar-strip__badge-icon" />
                <span>{count}</span>
              </span>
            ) : (
              <span className="order-calendar-strip__badge order-calendar-strip__badge--empty" aria-hidden />
            )}
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
