'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { ApiClientError, type DeliveryBoardDto } from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';
import {
  BOARD_SECTION_LABELS,
  deliveryStatusLabel,
  formatWindow,
  todayIsoDate,
} from '@/lib/delivery-labels';

type SectionKey = keyof DeliveryBoardDto['sections'];

const SECTION_ORDER: SectionKey[] = [
  'problems',
  'needsPlanning',
  'withoutCourier',
  'readyForDispatch',
  'assigned',
  'inTransit',
  'orderPreparing',
  'delivered',
];

export default function DeliveriesBoardPage() {
  const params = useParams<{ organizationId: string; storeId: string }>();
  const searchParams = useSearchParams();
  const auth = useAuth();
  const { organizationId, storeId } = params;
  const base = `/organizations/${organizationId}/stores/${storeId}`;

  const [date, setDate] = useState(searchParams.get('date') || todayIsoDate());
  const [statusFilter, setStatusFilter] = useState('');
  const [board, setBoard] = useState<DeliveryBoardDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canRead = auth.hasPermission('delivery:read');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getApiClient().getDeliveryBoard(organizationId, storeId, date);
      setBoard(data);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load board');
    } finally {
      setLoading(false);
    }
  }, [organizationId, storeId, date]);

  useEffect(() => {
    if (!canRead) return;
    void load();
  }, [canRead, load]);

  const filteredSections = useMemo(() => {
    if (!board) return [];
    return SECTION_ORDER.map((key) => {
      const cards = board.sections[key].filter((card) =>
        statusFilter ? card.status === statusFilter : true,
      );
      return { key, cards };
    }).filter((section) => section.cards.length > 0 || !statusFilter);
  }, [board, statusFilter]);

  if (!canRead) {
    return (
      <main>
        <PageContainer>
          <ErrorState message="Access denied: delivery:read required." />
        </PageContainer>
      </main>
    );
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Доставка"
          description="Операционная доска доставок на день."
          breadcrumbs={[
            { label: 'Store', href: base },
            { label: 'Доставка' },
          ]}
          actions={
            <div className="delivery-action-row">
              <Button type="button" variant="secondary" onClick={() => void load()}>
                Обновить
              </Button>
              {auth.hasPermission('delivery:manage-couriers') ? (
                <Link href={`${base}/couriers`}>
                  <Button type="button" variant="secondary">
                    Курьеры
                  </Button>
                </Link>
              ) : null}
              {auth.hasPermission('delivery:manage-routes') || canRead ? (
                <Link href={`${base}/delivery-routes`}>
                  <Button type="button" variant="secondary">
                    Маршруты
                  </Button>
                </Link>
              ) : null}
            </div>
          }
        />

        <nav className="delivery-tabs" aria-label="Delivery views">
          <Link href={`${base}/deliveries`} aria-current="page">
            Доска
          </Link>
          <Link href={`${base}/deliveries/map`}>Карта</Link>
          <Link href={`${base}/deliveries/calendar`}>Календарь</Link>
        </nav>

        <Section>
          <Card title="Фильтры">
            <div className="stack-form">
              <label>
                Дата
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <label>
                Статус
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="">Все</option>
                  {[
                    'DRAFT',
                    'PLANNED',
                    'READY_FOR_DISPATCH',
                    'ASSIGNED',
                    'IN_TRANSIT',
                    'DELIVERED',
                    'PROBLEM',
                    'CANCELLED',
                  ].map((value) => (
                    <option key={value} value={value}>
                      {deliveryStatusLabel(value)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </Card>
        </Section>

        {loading ? <LoadingState message="Загрузка доски…" /> : null}
        {error ? <ErrorState message={error} /> : null}

        {!loading && !error && board ? (
          <Section>
            <div className="delivery-board-sections">
              {filteredSections.map(({ key, cards }) => (
                <Card
                  key={key}
                  title={`${BOARD_SECTION_LABELS[key] ?? key} (${cards.length})`}
                >
                  {cards.length === 0 ? (
                    <EmptyState message="Пусто." />
                  ) : (
                    <ul className="list-stack">
                      {cards.map((card) => (
                        <li key={card.id}>
                          <Link
                            href={`${base}/deliveries/${card.id}`}
                            className="delivery-board-card"
                          >
                            <div className="meta-row">
                              <strong>{card.number}</strong>
                              <StatusBadge status={card.status} />
                              <span>{deliveryStatusLabel(card.status)}</span>
                              {card.urgency && card.urgency !== 'NORMAL' ? (
                                <span
                                  className={`urgency-badge urgency-badge--${card.urgency.toLowerCase()}`}
                                >
                                  {card.urgency}
                                </span>
                              ) : null}
                            </div>
                            <p className="order-card__sub">
                              {[
                                card.orderNumber ? `Заказ ${card.orderNumber}` : null,
                                formatWindow(card.windowStart, card.windowEnd),
                                card.displayAddress,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              ))}
            </div>
          </Section>
        ) : null}
      </PageContainer>
    </main>
  );
}
