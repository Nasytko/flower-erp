'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { ApiClientError, type DeliveryMapDto } from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';
import { MapPlaceholder, type MapPoint } from '@/components/delivery/map-placeholder';
import { SegmentedControl } from '@/components/workspace/workspace-ui';
import {
  deliveryStatusLabel,
  formatWindow,
  todayIsoDate,
} from '@/lib/delivery-labels';

export default function DeliveriesMapPage() {
  const params = useParams<{ organizationId: string; storeId: string }>();
  const auth = useAuth();
  const { organizationId, storeId } = params;
  const base = `/organizations/${organizationId}/stores/${storeId}`;

  const [date, setDate] = useState(todayIsoDate());
  const [data, setData] = useState<DeliveryMapDto | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<'list' | 'map'>('list');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canRead = auth.hasPermission('delivery:read');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const map = await getApiClient().getDeliveryMap(organizationId, storeId, date);
      setData(map);
      setSelectedId((prev) => {
        const ids = [...map.points, ...map.needsAddressClarification].map((p) => p.deliveryId);
        return prev && ids.includes(prev) ? prev : (map.points[0]?.deliveryId ?? null);
      });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load map');
    } finally {
      setLoading(false);
    }
  }, [organizationId, storeId, date]);

  useEffect(() => {
    if (!canRead) return;
    void load();
  }, [canRead, load]);

  const mapPoints: MapPoint[] = useMemo(
    () =>
      (data?.points ?? []).map((p) => ({
        id: p.deliveryId,
        latitude: p.latitude,
        longitude: p.longitude,
        label: p.displayAddress,
        meta: `${deliveryStatusLabel(p.status)} · ${formatWindow(p.windowStart, p.windowEnd)}`,
      })),
    [data],
  );

  const selectedPoint = useMemo(() => {
    if (!data || !selectedId) return null;
    return (
      [...data.points, ...data.needsAddressClarification].find((p) => p.deliveryId === selectedId) ??
      null
    );
  }, [data, selectedId]);

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
          title="Карта доставок"
          description="Список точек и заглушка карты (без Google Maps)."
          breadcrumbs={[
            { label: 'Доставка', href: `${base}/deliveries` },
            { label: 'Карта' },
          ]}
          actions={
            <Button type="button" variant="secondary" onClick={() => void load()}>
              Обновить
            </Button>
          }
        />

        <nav className="delivery-tabs" aria-label="Delivery views">
          <Link href={`${base}/deliveries`}>Доска</Link>
          <Link href={`${base}/deliveries/map`} aria-current="page">
            Карта
          </Link>
          <Link href={`${base}/deliveries/calendar`}>Календарь</Link>
        </nav>

        <Section>
          <Card title="Дата">
            <label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
          </Card>
        </Section>

        <div className="delivery-map-mobile-toggle" style={{ marginBottom: 16 }}>
          <SegmentedControl
            ariaLabel="Map or list"
            value={mobileView}
            onChange={(v) => setMobileView(v as 'list' | 'map')}
            options={[
              { value: 'list', label: 'Список' },
              { value: 'map', label: 'Карта' },
            ]}
          />
        </div>

        {loading ? <LoadingState message="Загрузка карты…" /> : null}
        {error ? <ErrorState message={error} /> : null}

        {!loading && !error && data ? (
          <div className="delivery-map-layout">
            <Section>
              <div
                className={
                  mobileView === 'map' ? 'delivery-map-panel' : 'delivery-map-panel delivery-map-panel--mobile-hidden'
                }
                data-mobile-view={mobileView}
              >
                <Card title="Карта">
                  <MapPlaceholder
                    points={mapPoints}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                  />
                </Card>
              </div>
            </Section>

            <Section>
              <div
                className={
                  mobileView === 'list'
                    ? 'delivery-map-panel'
                    : 'delivery-map-panel delivery-map-panel--mobile-hidden'
                }
              >
                <Card title="Точки с координатами">
                  {data.points.length === 0 ? (
                    <EmptyState message="Нет точек с координатами." />
                  ) : (
                    <ul className="list-stack">
                      {data.points.map((point) => (
                        <li key={point.deliveryId}>
                          <button
                            type="button"
                            className={
                              point.deliveryId === selectedId
                                ? 'delivery-map-point delivery-map-point--selected'
                                : 'delivery-map-point'
                            }
                            onClick={() => setSelectedId(point.deliveryId)}
                          >
                            <div className="meta-row">
                              <StatusBadge status={point.status} />
                              <span>{deliveryStatusLabel(point.status)}</span>
                            </div>
                            <strong>{point.displayAddress}</strong>
                            <span className="delivery-map-point__meta">
                              {formatWindow(point.windowStart, point.windowEnd)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>

                <Card title="Требуют уточнения адреса">
                  {data.needsAddressClarification.length === 0 ? (
                    <EmptyState message="Все адреса с координатами." />
                  ) : (
                    <ul className="list-stack">
                      {data.needsAddressClarification.map((point) => (
                        <li key={point.deliveryId}>
                          <div
                            className={
                              point.deliveryId === selectedId
                                ? 'delivery-map-point delivery-map-point--selected'
                                : 'delivery-map-point'
                            }
                          >
                            <button
                              type="button"
                              className="delivery-map-point"
                              style={{ border: 'none', padding: 0, boxShadow: 'none' }}
                              onClick={() => setSelectedId(point.deliveryId)}
                            >
                              <StatusBadge status={point.status} />
                              <strong>{point.displayAddress || 'Адрес не указан'}</strong>
                            </button>
                            <Link href={`${base}/deliveries/${point.deliveryId}`}>Открыть</Link>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>

                {selectedPoint ? (
                  <Card title="Выбранная доставка">
                    <div className="stack-form">
                      <div className="meta-row">
                        <StatusBadge status={selectedPoint.status} />
                        <span>{deliveryStatusLabel(selectedPoint.status)}</span>
                      </div>
                      <p>{selectedPoint.displayAddress}</p>
                      <p>
                        Окно: {formatWindow(selectedPoint.windowStart, selectedPoint.windowEnd)}
                      </p>
                      <div className="delivery-action-row">
                        <Link href={`${base}/deliveries/${selectedPoint.deliveryId}`}>
                          <Button type="button">Открыть доставку</Button>
                        </Link>
                        {selectedPoint.navigationUrl ? (
                          <a href={selectedPoint.navigationUrl} target="_blank" rel="noreferrer">
                            <Button type="button" variant="secondary">
                              Навигатор
                            </Button>
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </Card>
                ) : null}
              </div>
            </Section>
          </div>
        ) : null}
      </PageContainer>
    </main>
  );
}
