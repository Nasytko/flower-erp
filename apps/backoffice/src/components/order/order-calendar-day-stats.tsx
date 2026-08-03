'use client';

import type { OrderBoardColumn, OrderCalendarBoardDto } from '@flower/api-client';
import {
  ORDER_BOARD_COLUMN_LABELS,
  ORDER_BOARD_COLUMN_TONE,
  ORDER_BOARD_COLUMNS,
} from '@/lib/order-calendar-labels';

type OrderCalendarDayStatsProps = {
  sections: OrderCalendarBoardDto['sections'];
};

export function OrderCalendarDayStats({ sections }: OrderCalendarDayStatsProps) {
  const rows = ORDER_BOARD_COLUMNS.map((column) => ({
    column,
    count: sections[column]?.length ?? 0,
  }));
  const total = rows.reduce((sum, row) => sum + row.count, 0);

  if (total === 0) {
    return (
      <p className="order-calendar-day-stats order-calendar-day-stats--empty" role="status">
        <span className="order-calendar-day-stats__empty-dot" aria-hidden />
        На выбранный день заказов нет
      </p>
    );
  }

  return (
    <div className="order-calendar-day-stats" role="status" aria-label="Сводка заказов на день">
      <span className="order-calendar-day-stats__total">
        Всего: <strong>{total}</strong>
      </span>
      <ul className="order-calendar-day-stats__list">
        {rows.map(({ column, count }) => (
          <li key={column}>
            <OrderCalendarStatChip column={column} count={count} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function OrderCalendarStatChip({ column, count }: { column: OrderBoardColumn; count: number }) {
  const tone = ORDER_BOARD_COLUMN_TONE[column];
  return (
    <span
      className={`order-calendar-day-stats__chip order-calendar-day-stats__chip--${tone}${count === 0 ? ' order-calendar-day-stats__chip--zero' : ''}`}
    >
      <span className="order-calendar-day-stats__chip-label">{ORDER_BOARD_COLUMN_LABELS[column]}</span>
      <span className="order-calendar-day-stats__chip-count">{count}</span>
    </span>
  );
}
