'use client';

import { useMemo, useState, type DragEvent } from 'react';
import type { OrderBoardCardDto, OrderBoardColumn } from '@flower/api-client';
import { EmptyState } from '@/components/layout/states';
import { InlineAlert } from '@/components/workspace/workspace-ui';
import { OrderCalendarCard } from '@/components/order/order-calendar-card';
import { OrderCalendarColumnHeader } from '@/components/order/order-calendar-date-strip';
import { ORDER_BOARD_COLUMNS } from '@/lib/order-calendar-labels';
import {
  calendarMoveLabel,
  canDragCard,
  canDropCardOnColumn,
  type CalendarMoveContext,
} from '@/lib/order-calendar-move';

type OrderCalendarBoardProps = {
  sections: Record<OrderBoardColumn, OrderBoardCardDto[]>;
  selectedId: string | null;
  permissions: {
    canAssign: boolean;
    canPrepare: boolean;
    canDelivery: boolean;
  };
  onSelect: (card: OrderBoardCardDto) => void;
  onMove: (ctx: Pick<CalendarMoveContext, 'card' | 'fromColumn' | 'toColumn'>) => Promise<void>;
};

export function OrderCalendarBoard({
  sections,
  selectedId,
  permissions,
  onSelect,
  onMove,
}: OrderCalendarBoardProps) {
  const [dragging, setDragging] = useState<{ card: OrderBoardCardDto; fromColumn: OrderBoardColumn } | null>(null);
  const [dropTarget, setDropTarget] = useState<OrderBoardColumn | null>(null);
  const [moveHint, setMoveHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const columnCards = useMemo(
    () =>
      ORDER_BOARD_COLUMNS.map((column) => ({
        column,
        cards: sections[column] ?? [],
      })),
    [sections],
  );

  function handleDragStart(card: OrderBoardCardDto, fromColumn: string) {
    setDragging({ card, fromColumn: fromColumn as OrderBoardColumn });
    setError(null);
  }

  function handleDragEnd() {
    setDragging(null);
    setDropTarget(null);
    setMoveHint(null);
  }

  function handleDragOver(e: DragEvent, column: OrderBoardColumn) {
    e.preventDefault();
    e.stopPropagation();
    if (!dragging) return;
    if (!canDropCardOnColumn(dragging.fromColumn, column, dragging.card)) {
      e.dataTransfer.dropEffect = 'none';
      if (dropTarget === column) {
        setDropTarget(null);
        setMoveHint(null);
      }
      return;
    }
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(column);
    setMoveHint(calendarMoveLabel(dragging.fromColumn, column, dragging.card));
  }

  function handleDragLeave(e: DragEvent, column: OrderBoardColumn) {
    const next = e.relatedTarget as Node | null;
    if (next && e.currentTarget.contains(next)) return;
    if (dropTarget === column) {
      setDropTarget(null);
      setMoveHint(null);
    }
  }

  async function handleDrop(e: DragEvent, column: OrderBoardColumn) {
    e.preventDefault();
    e.stopPropagation();
    if (!dragging) return;
    if (!canDropCardOnColumn(dragging.fromColumn, column, dragging.card)) return;

    setBusy(true);
    setError(null);
    try {
      await onMove({
        card: dragging.card,
        fromColumn: dragging.fromColumn,
        toColumn: column,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось переместить заказ');
    } finally {
      setBusy(false);
      handleDragEnd();
    }
  }

  return (
    <div className="order-calendar-board-wrap">
      {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}
      {moveHint && dropTarget ? (
        <InlineAlert tone="info">{moveHint}</InlineAlert>
      ) : null}
      {busy ? <p className="order-calendar-board__busy">Обновление…</p> : null}
      <div className="order-calendar-board">
        {columnCards.map(({ column, cards }) => {
          const droppable =
            dragging &&
            canDropCardOnColumn(dragging.fromColumn, column, dragging.card);
          return (
            <section
              key={column}
              className={`order-calendar-column${dropTarget === column ? ' order-calendar-column--drop-target' : ''}`}
              onDragOver={(e) => handleDragOver(e, column)}
              onDragLeave={(e) => handleDragLeave(e, column)}
              onDrop={(e) => void handleDrop(e, column)}
            >
              <OrderCalendarColumnHeader column={column} count={cards.length} />
              <div
                className={`order-calendar-column__cards${droppable ? ' order-calendar-column__cards--droppable' : ''}${cards.length === 0 ? ' order-calendar-column__cards--empty' : ''}`}
              >
                {cards.length === 0 ? (
                  <EmptyState message={droppable ? 'Отпустите здесь' : 'Пока ничего нет'} />
                ) : (
                  cards.map((card) => (
                    <OrderCalendarCard
                      key={card.id}
                      card={card}
                      selected={selectedId === card.id}
                      draggable={canDragCard(column, permissions) && !busy}
                      onSelect={onSelect}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
