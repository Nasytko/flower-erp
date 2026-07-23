'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card } from '@flower/ui';
import {
  ApiClientError,
  type DeliveryJobDto,
  type DeliveryRoutePlanDto,
} from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';
import { ConfirmDialog } from '@/components/workspace/workspace-ui';
import { deliveryStatusLabel, formatWindow } from '@/lib/delivery-labels';

export default function DeliveryRouteDetailPage() {
  const params = useParams<{ organizationId: string; storeId: string; routeId: string }>();
  const auth = useAuth();
  const { organizationId, storeId, routeId } = params;
  const base = `/organizations/${organizationId}/stores/${storeId}`;

  const [route, setRoute] = useState<DeliveryRoutePlanDto | null>(null);
  const [jobs, setJobs] = useState<DeliveryJobDto[]>([]);
  const [addJobId, setAddJobId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmComplete, setConfirmComplete] = useState(false);

  const canRead = auth.hasPermission('delivery:read');
  const canManage = auth.hasPermission('delivery:manage-routes');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = getApiClient();
      const detail = await client.getDeliveryRoute(organizationId, storeId, routeId);
      setRoute(detail);
      const deliveries = await client.listDeliveries(organizationId, storeId, {
        deliveryDate: detail.serviceDate,
      });
      setJobs(deliveries);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось загрузить маршрут');
    } finally {
      setLoading(false);
    }
  }, [organizationId, storeId, routeId]);

  useEffect(() => {
    if (!canRead) return;
    void load();
  }, [canRead, load]);

  async function run(action: () => Promise<DeliveryRoutePlanDto>) {
    setBusy(true);
    setError(null);
    try {
      const next = await action();
      setRoute(next);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Действие не выполнено');
    } finally {
      setBusy(false);
    }
  }

  function jobLabel(jobId: string): string {
    const job = jobs.find((j) => j.id === jobId);
    return job ? `${job.number} · ${job.displayAddress}` : jobId;
  }

  const stopIds = route?.stops.map((s) => s.deliveryJobId) ?? [];
  const availableJobs = jobs.filter(
    (j) => !stopIds.includes(j.id) && !['DELIVERED', 'CANCELLED'].includes(j.status),
  );

  async function moveStop(index: number, direction: -1 | 1) {
    if (!route) return;
    const ordered = [...stopIds];
    const next = index + direction;
    if (next < 0 || next >= ordered.length) return;
    const tmp = ordered[index]!;
    ordered[index] = ordered[next]!;
    ordered[next] = tmp;
    await run(() =>
      getApiClient().reorderDeliveryRouteStops(organizationId, storeId, routeId, {
        expectedVersion: route.version,
        orderedDeliveryJobIds: ordered,
      }),
    );
  }

  if (!canRead) {
    return (
      <main>
        <PageContainer>
          <ErrorState message="Доступ запрещён." />
        </PageContainer>
      </main>
    );
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title={route ? route.name : 'Маршрут'}
          description={route ? `${route.serviceDate} · ${route.status}` : 'Загрузка…'}
          breadcrumbs={[
            { label: 'Маршруты', href: `${base}/delivery-routes` },
            { label: route?.name ?? routeId },
          ]}
          actions={
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void load()}>
              Обновить
            </Button>
          }
        />

        {loading ? <LoadingState /> : null}
        {error ? <ErrorState message={error} /> : null}

        {!loading && route ? (
          <>
            <Section>
              <Card title="Статус">
                <div className="meta-row">
                  <StatusBadge status={route.status} />
                  <span>{route.status}</span>
                  <span>v{route.version}</span>
                </div>
                {canManage ? (
                  <div className="delivery-action-row" style={{ marginTop: 16 }}>
                    {route.status === 'DRAFT' ? (
                      <Button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void run(() =>
                            getApiClient().activateDeliveryRoute(
                              organizationId,
                              storeId,
                              routeId,
                              { expectedVersion: route.version },
                            ),
                          )
                        }
                      >
                        Активировать
                      </Button>
                    ) : null}
                    {route.status === 'ACTIVE' ? (
                      <Button type="button" disabled={busy} onClick={() => setConfirmComplete(true)}>
                        Завершить
                      </Button>
                    ) : null}
                    {route.status === 'DRAFT' || route.status === 'ACTIVE' ? (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={busy}
                        onClick={() =>
                          void run(() =>
                            getApiClient().cancelDeliveryRoute(organizationId, storeId, routeId, {
                              expectedVersion: route.version,
                            }),
                          )
                        }
                      >
                        Отменить план
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </Card>
            </Section>

            {canManage && route.status === 'DRAFT' ? (
              <Section>
                <Card title="Добавить остановку">
                  <div className="stack-form">
                    <label>
                      Доставка
                      <select value={addJobId} onChange={(e) => setAddJobId(e.target.value)}>
                        <option value="">—</option>
                        {availableJobs.map((j) => (
                          <option key={j.id} value={j.id}>
                            {j.number} · {deliveryStatusLabel(j.status)} ·{' '}
                            {formatWindow(j.windowStart, j.windowEnd)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Button
                      type="button"
                      disabled={busy || !addJobId}
                      onClick={() => {
                        if (!addJobId) return;
                        void run(() =>
                          getApiClient().addDeliveryRouteStops(organizationId, storeId, routeId, {
                            expectedVersion: route.version,
                            deliveryJobIds: [addJobId],
                          }),
                        ).then(() => setAddJobId(''));
                      }}
                    >
                      Добавить
                    </Button>
                  </div>
                </Card>
              </Section>
            ) : null}

            <Section>
              <Card title={`Остановки (${route.stops.length})`}>
                {route.stops.length === 0 ? (
                  <EmptyState message="Остановок пока нет." />
                ) : (
                  <ul className="list-stack">
                    {[...route.stops]
                      .sort((a, b) => a.sequence - b.sequence)
                      .map((stop, index) => (
                        <li key={stop.id}>
                          <div className="meta-row">
                            <strong>#{stop.sequence}</strong>
                            <Link href={`${base}/deliveries/${stop.deliveryJobId}`}>
                              {jobLabel(stop.deliveryJobId)}
                            </Link>
                            {canManage && route.status === 'DRAFT' ? (
                              <>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  disabled={busy || index === 0}
                                  onClick={() => void moveStop(index, -1)}
                                  aria-label="Переместить вверх"
                                >
                                  Вверх
                                </Button>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  disabled={busy || index === route.stops.length - 1}
                                  onClick={() => void moveStop(index, 1)}
                                  aria-label="Переместить вниз"
                                >
                                  Вниз
                                </Button>
                              </>
                            ) : null}
                          </div>
                        </li>
                      ))}
                  </ul>
                )}
              </Card>
            </Section>
          </>
        ) : null}
      </PageContainer>

      <ConfirmDialog
        open={confirmComplete}
        title="Завершить маршрут?"
        message="Маршрут будет помечен как COMPLETED."
        confirmLabel="Завершить"
        busy={busy}
        onCancel={() => setConfirmComplete(false)}
        onConfirm={() => {
          if (!route) return;
          setConfirmComplete(false);
          void run(() =>
            getApiClient().completeDeliveryRoute(organizationId, storeId, routeId, {
              expectedVersion: route.version,
            }),
          );
        }}
      />
    </main>
  );
}
