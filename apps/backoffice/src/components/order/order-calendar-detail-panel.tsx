'use client';

import Link from 'next/link';
import { Button, Card } from '@flower/ui';
import type { OrderBoardCardDto } from '@flower/api-client';
import { DocRef } from '@/components/layout/doc-ref';
import { formatMoney } from '@/lib/format-money';
import {
  formatOrderTimeWindow,
  paymentStatusLabel,
} from '@/lib/order-calendar-labels';
import { orderPhaseLabel, resolveOrderPhase } from '@/lib/order-ui';

type OrderCalendarDetailPanelProps = {
  base: string;
  card: OrderBoardCardDto | null;
  onClose: () => void;
};

export function OrderCalendarDetailPanel({ base, card, onClose }: OrderCalendarDetailPanelProps) {
  if (!card) return null;

  const phase = resolveOrderPhase(
    { status: card.status, type: card.type, displayPhase: card.displayPhase, displayPhaseLabel: card.displayPhaseLabel },
    card.deliveryStatus
      ? { status: card.deliveryStatus, handedOverAt: card.column === 'HANDED_OFF' ? card.readyAt : null }
      : null,
  );

  return (
    <aside className="order-calendar-detail" aria-label="Детали заказа">
      <Card title="Детали заказа">
        <div className="order-calendar-detail__actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Закрыть
          </Button>
          <Link href={`${base}/orders/${card.id}`}>
            <Button type="button">Открыть заказ</Button>
          </Link>
        </div>

        <dl className="order-calendar-detail__list">
          <div>
            <dt>Заказ</dt>
            <dd>
              <DocRef>{card.number}</DocRef>
            </dd>
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
              <dd>{card.customerPhone}</dd>
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
            <dd>{orderPhaseLabel(phase, { type: card.type, displayPhase: card.displayPhase, displayPhaseLabel: card.displayPhaseLabel })}</dd>
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
      </Card>
    </aside>
  );
}
