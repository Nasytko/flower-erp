'use client';

import { useRef, type DragEvent } from 'react';
import type { OrderBoardCardDto } from '@flower/api-client';
import { DocRef } from '@/components/layout/doc-ref';
import {
  DeliveryIcon,
  GripIcon,
  StoreIcon,
} from '@/components/order/order-calendar-icons';
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
  const draggedRef = useRef(false);
  const displayName = card.customerName ?? card.recipientName ?? 'Без имени';
  const timeLabel = formatOrderTimeWindow({
    readyAt: card.readyAt,
    deliveryWindowStart: card.deliveryWindowStart,
    deliveryWindowEnd: card.deliveryWindowEnd,
  });
  const paid = card.paymentStatus === 'PAID';
  const partial = card.paymentStatus === 'PARTIALLY_PAID';
  const isDelivery = card.type === 'DELIVERY';

  function handleSelect() {
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    onSelect(card);
  }

  function handleDragStart(e: DragEvent<HTMLButtonElement>) {
    if (!draggable) {
      e.preventDefault();
      return;
    }
    draggedRef.current = true;
    e.dataTransfer.setData('application/x-order-id', card.id);
    e.dataTransfer.effectAllowed = 'move';
    if (e.dataTransfer.setDragImage && e.currentTarget.closest('.order-calendar-card')) {
      const cardEl = e.currentTarget.closest('.order-calendar-card') as HTMLElement;
      e.dataTransfer.setDragImage(cardEl, cardEl.offsetWidth / 2, 20);
    }
    onDragStart(card, card.column);
  }

  function handleDragEnd() {
    window.setTimeout(() => {
      draggedRef.current = false;
    }, 0);
    onDragEnd();
  }

  return (
    <article
      className={`order-calendar-card${selected ? ' order-calendar-card--selected' : ''}${draggable ? ' order-calendar-card--draggable' : ''}`}
    >
      {draggable ? (
        <button
          type="button"
          className="order-calendar-card__handle"
          aria-label="Перетащить заказ"
          draggable
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <GripIcon className="order-calendar-card__handle-icon" />
        </button>
      ) : null}

      <div
        role="button"
        tabIndex={0}
        className="order-calendar-card__body"
        onClick={handleSelect}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleSelect();
          }
        }}
      >
        <div className="order-calendar-card__top">
          <span className="order-calendar-card__time">{timeLabel}</span>
          <div className="order-calendar-card__meta">
            <span
              className={`order-calendar-card__type order-calendar-card__type--${isDelivery ? 'delivery' : 'pickup'}`}
              title={isDelivery ? 'Доставка' : 'Самовывоз'}
            >
              {isDelivery ? (
                <DeliveryIcon title="Доставка" />
              ) : (
                <StoreIcon title="Самовывоз" />
              )}
              <span>{isDelivery ? 'Доставка' : 'Магазин'}</span>
            </span>
            <span
              className={`order-calendar-card__pay${
                paid ? ' order-calendar-card__pay--paid' : partial ? ' order-calendar-card__pay--partial' : ''
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
    </article>
  );
}
