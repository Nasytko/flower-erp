'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { ApiClientError, type DeliveryCalendarDto } from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';
import {
  deliveryStatusLabel,
  formatWindow,
  todayIsoDate,
} from '@/lib/delivery-labels';

function formatHourLabel(hourKey: string): string {
  // hourKey like 2026-07-17T14
  const asDate = new Date(`${hourKey}:00:00.000Z`);
  if (Number.isNaN(asDate.getTime())) return hourKey;
  return asDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function DeliveriesCalendarPage() {
  const params = useParams<{ organizationId: string; storeId: string }>();
  const auth = useAuth();
  const { organizationId, storeId } = params;
  const base = `/organizations/${organizationId}/stores/${storeId}`;

  const [date, setDate] = useState(todayIsoDate());
  const [data, setData] = useState<DeliveryCalendarDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canRead = auth.hasPermission('delivery:read');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const calendar = await getApiClient().getDeliveryCalendar(organizationId, storeId, date);
      setData(calendar);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load calendar');
    } finally {
      setLoading(false);
    }
  }, [organizationId, storeId, date]);

  useEffect(() => {
    if (!canRead) return;
    void load();
  }, [canRead, load]);

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
          title="Календарь доставок"
          description="День, сгруппированный по часу окна доставки."
          breadcrumbs={[
            { label: 'Доставка', href: `${base}/deliveries` },
            { label: 'Календарь' },
          ]}
          actions={
            <Button type="button" variant="secondary" onClick={() => void load()}>
              Обновить
            </Button>
          }
        />

        <nav className="delivery-tabs" aria-label="Delivery views">
          <Link href={`${base}/deliveries`}>Доска</Link>
          <Link href={`${base}/deliveries/map`}>Карта</Link>
          <Link href={`${base}/deliveries/calendar`} aria-current="page">
            Календарь
          </Link>
        </nav>

        <Section>
          <Card title="День">
            <label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
          </Card>
        </Section>

        {loading ? <LoadingState message="Загрузка календаря…" /> : null}
        {error ? <ErrorState message={error} /> : null}

        {!loading && !error && data ? (
          <Section>
            {data.hours.length === 0 ? (
              <EmptyState message="Нет доставок на этот день." />
            ) : (
              data.hours.map((slot) => (
                <div key={slot.hour} className="delivery-calendar-hour">
                  <Card title={`${formatHourLabel(slot.hour)} (${slot.deliveries.length})`}>
                    <ul className="list-stack">
                      {slot.deliveries.map((card) => (
                        <li key={card.id}>
                          <Link
                            href={`${base}/deliveries/${card.id}`}
                            className="delivery-board-card"
                          >
                            <div className="meta-row">
                              <strong>{card.number}</strong>
                              <StatusBadge status={card.status} />
                              <span>{deliveryStatusLabel(card.status)}</span>
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
                  </Card>
                </div>
              ))
            )}
          </Section>
        ) : null}
      </PageContainer>
    </main>
  );
}
