'use client';

import Link from 'next/link';
import type { OrderBoardCardDto } from '@flower/api-client';
import { DocRef } from '@/components/layout/doc-ref';
import { formatMoney } from '@/lib/format-money';
import {
  formatOrderTimeWindow,
  paymentStatusLabel,
} from '@/lib/order-calendar-labels';
import { orderPhaseLabel, resolveOrderPhase } from '@/lib/order-ui';

type OrderCalendarDetailContentProps = {
  base: string;
  card: OrderBoardCardDto;
};

export function OrderCalendarDetailContent({ base, card }: OrderCalendarDetailContentProps) {
  const phase = resolveOrderPhase(
    { status: card.status, type: card.type, displayPhase: card.displayPhase, displayPhaseLabel: card.displayPhaseLabel },
    card.deliveryStatus
      ? { status: card.deliveryStatus, handedOverAt: card.column === 'HANDED_OFF' ? card.readyAt : null }
      : null,
  );

  return (
    <dl className="order-calendar-detail__list">
      <div>
        <dt>Заказ</dt>
        <dd>
          <DocRef>{card.number}</DocRef>
        </dd>
      </div>
      <div>
        <dt>Тип</dt>
        <dd>{card.type === 'DELIVERY' ? 'Доставка' : 'Самовывоз (магазин)'}</dd>
      </div>
      <div>
        <dt>Время</dt>
        <dd>
          {formatOrderTimeWindow({
            readyAt: card.readyAt,
            deliveryWindowStart: card.deliveryWindowStart,
            deliveryWindowEnd: card.deliveryWindowEnd,
          })}
        </dd>
      </div>
      <div>
        <dt>Клиент</dt>
        <dd>{card.customerName ?? card.recipientName ?? '—'}</dd>
      </div>
      {card.customerPhone ? (
        <div>
          <dt>Телефон</dt>
          <dd>
            <a href={`tel:${card.customerPhone}`}>{card.customerPhone}</a>
          </dd>
        </div>
      ) : null}
      <div>
        <dt>Бюджет</dt>
        <dd>{formatMoney(card.plannedPrice)}</dd>
      </div>
      <div>
        <dt>Состав</dt>
        <dd>{card.compositionLabel ?? '—'}</dd>
      </div>
      <div>
        <dt>Флорист</dt>
        <dd>{card.floristDisplayName ?? 'Не назначен'}</dd>
      </div>
      <div>
        <dt>Статус</dt>
        <dd>
          {orderPhaseLabel(phase, {
            type: card.type,
            displayPhase: card.displayPhase,
            displayPhaseLabel: card.displayPhaseLabel,
          })}
        </dd>
      </div>
      <div>
        <dt>Оплата</dt>
        <dd>{paymentStatusLabel(card.paymentStatus)}</dd>
      </div>
      {card.deliveryId ? (
        <div>
          <dt>Доставка</dt>
          <dd>
            <Link href={`${base}/deliveries/${card.deliveryId}`}>Открыть доставку</Link>
          </dd>
        </div>
      ) : null}
    </dl>
  );
}
