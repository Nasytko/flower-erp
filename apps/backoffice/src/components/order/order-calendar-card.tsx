'use client';

import Link from 'next/link';
import { useRef, type DragEvent, type MouseEvent } from 'react';
import { Button } from '@flower/ui';
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
  base: string;
  card: OrderBoardCardDto;
  draggable: boolean;
  canCreateSale: boolean;
  onOpen: (card: OrderBoardCardDto) => void;
  onDragStart: (card: OrderBoardCardDto, column: string) => void;
  onDragEnd: () => void;
};

export function OrderCalendarCard({
  base,
  card,
  draggable,
  canCreateSale,
  onOpen,
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
  const isCancelled = card.status === 'CANCELLED' || card.column === 'CANCELLED';
  const showSaleAction = canCreateSale && card.column === 'READY' && !card.saleId && !isCancelled;

  function handleOpen() {
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    onOpen(card);
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

  function stopCardClick(event: MouseEvent) {
    event.stopPropagation();
  }

  return (
    <article
      className={`order-calendar-card${draggable ? ' order-calendar-card--draggable' : ''}${isCancelled ? ' order-calendar-card--cancelled' : ''}`}
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
        onClick={handleOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleOpen();
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
              {paid ? '●' : partial ? '◐' : '○'}
            </span>
          </div>
        </div>
        <strong className="order-calendar-card__name">{displayName}</strong>
        {card.customerPhone ? (
          <span className="order-calendar-card__phone">{card.customerPhone}</span>
        ) : null}
        {card.compositionLabel ? (
          <span className="order-calendar-card__composition">{card.compositionLabel}</span>
        ) : null}
        <div className="order-calendar-card__footer">
          <span className="order-calendar-card__price">
            {card.plannedPrice ? formatMoney(card.plannedPrice) : '—'}
          </span>
          <DocRef>{card.number}</DocRef>
        </div>
        {showSaleAction ? (
          <div className="order-calendar-card__actions" onClick={stopCardClick}>
            <Link href={`${base}/sales/new?fromOrder=${card.id}`}>
              <Button type="button" className="order-calendar-card__sale-btn">
                Оформить продажу
              </Button>
            </Link>
          </div>
        ) : null}
      </div>
    </article>
  );
}
