'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import {
  ApiClientError,
  type CourierProfileDto,
  type DeliveryRoutePlanDto,
} from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';
import { todayIsoDate } from '@/lib/delivery-labels';

export default function DeliveryRoutesPage() {
  const params = useParams<{ organizationId: string; storeId: string }>();
  const auth = useAuth();
  const { organizationId, storeId } = params;
  const base = `/organizations/${organizationId}/stores/${storeId}`;

  const [routes, setRoutes] = useState<DeliveryRoutePlanDto[]>([]);
  const [couriers, setCouriers] = useState<CourierProfileDto[]>([]);
  const [serviceDate, setServiceDate] = useState(todayIsoDate());
  const [name, setName] = useState('');
  const [courierProfileId, setCourierProfileId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canRead = auth.hasPermission('delivery:read');
  const canManage = auth.hasPermission('delivery:manage-routes');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = getApiClient();
      const [list, courierList] = await Promise.all([
        client.listDeliveryRoutes(organizationId, storeId, { serviceDate }),
        canManage
          ? client.listCouriers(organizationId, storeId, { status: 'ACTIVE' })
          : Promise.resolve([] as CourierProfileDto[]),
      ]);
      setRoutes(list);
      setCouriers(courierList);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось загрузить маршруты');
    } finally {
      setLoading(false);
    }
  }, [organizationId, storeId, serviceDate, canManage]);

  useEffect(() => {
    if (!canRead) return;
    void load();
  }, [canRead, load]);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const route = await getApiClient().createDeliveryRoute(organizationId, storeId, {
        serviceDate,
        name: name.trim(),
        courierProfileId: courierProfileId || null,
      });
      setName('');
      window.location.href = `${base}/delivery-routes/${route.id}`;
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось создать');
      setBusy(false);
    }
  }

  if (!canRead) {
    return (
      <main>
        <PageContainer>
          <ErrorState message="Доступ запрещён: требуется delivery:read." />
        </PageContainer>
      </main>
    );
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Маршруты доставки"
          description="Планы маршрутов на день."
          breadcrumbs={[
            { label: 'Доставка', href: `${base}/deliveries` },
            { label: 'Маршруты' },
          ]}
        />

        <Section>
          <Card title="Дата">
            <Input type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} />
          </Card>
        </Section>

        {canManage ? (
          <Section>
            <Card title="Новый план">
              <form className="stack-form" onSubmit={onCreate}>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Название маршрута"
                  required
                />
                <label>
                  Курьер
                  <select
                    value={courierProfileId}
                    onChange={(e) => setCourierProfileId(e.target.value)}
                  >
                    <option value="">—</option>
                    {couriers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.displayNameSnapshot}
                      </option>
                    ))}
                  </select>
                </label>
                <Button type="submit" disabled={busy}>
                  Создать план
                </Button>
              </form>
            </Card>
          </Section>
        ) : null}

        {loading ? <LoadingState /> : null}
        {error ? <ErrorState message={error} /> : null}

        <Section>
          <Card title={`Маршруты (${routes.length})`}>
            {routes.length === 0 ? (
              <EmptyState message="Маршрутов на эту дату нет." />
            ) : (
              <ul className="list-stack">
                {routes.map((route) => (
                  <li key={route.id}>
                    <Link href={`${base}/delivery-routes/${route.id}`}>
                      <div className="meta-row">
                        <strong>{route.name}</strong>
                        <StatusBadge status={route.status} />
                        <span>{route.status}</span>
                        <span>{route.stops.length} остановок</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Section>
      </PageContainer>
    </main>
  );
}
