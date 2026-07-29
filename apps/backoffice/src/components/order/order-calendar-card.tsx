'use client';

import type { DragEvent } from 'react';
import type { OrderBoardCardDto } from '@flower/api-client';
import { DocRef } from '@/components/layout/doc-ref';
import { formatMoney } from '@/lib/format-money';
import { formatOrderTimeWindow, paymentStatusLabel } from '@/lib/order-calendar-labels';

type OrderCalendarCardProps = {
  card: OrderBoardCardDto;
  selected: boolean;
  draggable: boolean;
  onSelect: (card: OrderBoardCardDto) => void;
  onDragStart: (card: OrderBoardCardDto, column: string) => void;
  onDragEnd: () => void;
};

export function OrderCalendarCard({
  card,
  selected,
  draggable,
  onSelect,
  onDragStart,
  onDragEnd,
}: OrderCalendarCardProps) {
  const displayName = card.customerName ?? card.recipientName ?? 'Без имени';
  const timeLabel = formatOrderTimeWindow({
    readyAt: card.readyAt,
    deliveryWindowStart: card.deliveryWindowStart,
    deliveryWindowEnd: card.deliveryWindowEnd,
  });
  const paid = card.paymentStatus === 'PAID';
  const partial = card.paymentStatus === 'PARTIALLY_PAID';

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={draggable}
      className={`order-calendar-card${selected ? ' order-calendar-card--selected' : ''}${draggable ? ' order-calendar-card--draggable' : ''}`}
      onClick={() => onSelect(card)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(card);
        }
      }}
      onDragStart={(e: DragEvent) => {
        if (!draggable) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.setData('application/x-order-id', card.id);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(card, card.column);
      }}
      onDragEnd={onDragEnd}
    >
      <div className="order-calendar-card__top">
        <span className="order-calendar-card__time">{timeLabel}</span>
        <div className="order-calendar-card__icons" aria-hidden>
          {card.type === 'DELIVERY' ? (
            <span className="order-calendar-card__icon order-calendar-card__icon--delivery" title="Доставка">
              🚚
            </span>
          ) : null}
          <span className="order-calendar-card__icon" title="Заказ">
            🛒
          </span>
          <span
            className={`order-calendar-card__icon order-calendar-card__icon--pay${
              paid ? ' order-calendar-card__icon--paid' : partial ? ' order-calendar-card__icon--partial' : ''
            }`}
            title={paymentStatusLabel(card.paymentStatus)}
          >
            {paid ? '₽' : partial ? '◐' : '○'}
          </span>
        </div>
      </div>
      <strong className="order-calendar-card__name">{displayName}</strong>
      {card.customerPhone ? (
        <span className="order-calendar-card__phone">{card.customerPhone}</span>
      ) : null}
      <div className="order-calendar-card__footer">
        <span className="order-calendar-card__price">
          {card.plannedPrice ? formatMoney(card.plannedPrice) : '—'}
        </span>
        <DocRef>{card.number}</DocRef>
      </div>
    </div>
  );
}
