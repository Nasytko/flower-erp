'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, Card } from '@flower/ui';
import { ApiClientError } from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { resolveStoreHomePath } from '@/lib/nav';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';

type Store = {
  id: string;
  name: string;
  code: string;
  status: string;
  address: string | null;
  timezone: string;
};

type Warehouse = {
  id: string;
  name: string;
  code: string;
  isDefault: boolean;
  type: string;
  status: string;
};

export default function StoreDetailPage() {
  const params = useParams<{ organizationId: string; storeId: string }>();
  const router = useRouter();
  const auth = useAuth();
  const { organizationId, storeId } = params;

  const [store, setStore] = useState<Store | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const home = resolveStoreHomePath(organizationId, storeId, auth.hasPermission);
    if (home !== `/organizations/${organizationId}/stores/${storeId}`) {
      router.replace(home);
    }
  }, [auth.hasPermission, organizationId, router, storeId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const client = getApiClient();
    Promise.all([
      client.getStore(organizationId, storeId),
      client.listWarehouses(organizationId, storeId),
    ])
      .then(([storeData, warehouseData]) => {
        if (cancelled) return;
        setStore(storeData);
        setWarehouses(warehouseData);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiClientError ? err.message : 'Не удалось загрузить');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, storeId]);

  const defaultWarehouse = warehouses.find((w) => w.isDefault) ?? warehouses[0];
  const base = `/organizations/${organizationId}/stores/${storeId}`;

  return (
    <main>
      <PageContainer>
        <PageHeader
          title={store ? `${store.name} (${store.code})` : 'Магазин'}
          description={store ? store.timezone : 'Загрузка данных магазина…'}
          breadcrumbs={[
            { label: 'Организации', href: '/organizations' },
            { label: 'Организация', href: `/organizations/${organizationId}` },
            { label: store?.name ?? 'Магазин' },
          ]}
          actions={store ? <StatusBadge status={store.status} /> : undefined}
        />

        {!loading && !error ? (
          <Section>
            <Card title="Операции">
              <div className="page-header__actions">
                {auth.hasPermission('workspace:read') ? (
                  <Button type="button" variant="secondary" onClick={() => router.push(`${base}/today`)}>
                    Сегодня
                  </Button>
                ) : null}
                {auth.hasPermission('operations:read') ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => router.push(`${base}/operations`)}
                  >
                    Операции
                  </Button>
                ) : null}
                <Button type="button" variant="secondary" onClick={() => router.push(`${base}/orders`)}>
                  Заказы
                </Button>
                <Button type="button" variant="secondary" onClick={() => router.push(`${base}/sales`)}>
                  Продажи
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => router.push(`${base}/supplies`)}
                >
                  Поставки
                </Button>
                {auth.hasPermission('inventory:read') ? (
                  <Button type="button" variant="secondary" onClick={() => router.push(`${base}/stock`)}>
                    Остатки
                  </Button>
                ) : defaultWarehouse ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      router.push(`${base}/warehouses/${defaultWarehouse.id}/inventory`)
                    }
                  >
                    Остатки
                  </Button>
                ) : null}
                {auth.hasPermission('write-offs:read') ? (
                  <Button type="button" variant="secondary" onClick={() => router.push(`${base}/write-offs`)}>
                    Списания
                  </Button>
                ) : null}
                {auth.hasPermission('transfers:read') ? (
                  <Button type="button" variant="secondary" onClick={() => router.push(`${base}/transfers`)}>
                    Перемещения
                  </Button>
                ) : null}
                {auth.hasPermission('inventory-counts:read') ? (
                  <Button type="button" variant="secondary" onClick={() => router.push(`${base}/inventory-counts`)}>
                    Инвентаризации
                  </Button>
                ) : null}
              </div>
            </Card>
          </Section>
        ) : null}

        {loading ? <LoadingState message="Загрузка магазина…" /> : null}
        {error ? <ErrorState message={error} /> : null}

        {!loading && !error && store ? (
          <>
            <Section>
              <Card title="Данные магазина">
                <div className="meta-row">
                  <StatusBadge status={store.status} />
                  <span>{store.timezone}</span>
                </div>
                {store.address ? (
                  <p style={{ margin: '12px 0 0' }}>{store.address}</p>
                ) : (
                  <p style={{ margin: '12px 0 0', color: 'var(--color-muted)' }}>Адрес не указан.</p>
                )}
              </Card>
            </Section>

            <Section>
              <Card title="Склад по умолчанию">
                {!defaultWarehouse ? (
                  <EmptyState message="Склад для этого магазина не найден." />
                ) : (
                  <div style={{ display: 'grid', gap: 8 }}>
                    <div className="meta-row">
                      <strong>
                        {defaultWarehouse.name} ({defaultWarehouse.code})
                      </strong>
                      <StatusBadge status={defaultWarehouse.status} />
                    </div>
                    <div className="meta-row">
                      {defaultWarehouse.isDefault ? (
                        <StatusBadge status="DEFAULT" />
                      ) : (
                        <StatusBadge status="WAREHOUSE" />
                      )}
                      <span>Тип: {defaultWarehouse.type}</span>
                      <span style={{ color: 'var(--color-muted)', fontSize: 'var(--text-xs)' }}>
                        {defaultWarehouse.id}
                      </span>
                    </div>
                    <div className="meta-row">
                      <Link href={`${base}/warehouses/${defaultWarehouse.id}/inventory`}>
                        Остатки / партии / движения
                      </Link>
                      {auth.hasPermission('inventory:read') ? (
                        <Link href={`${base}/stock`}>Операционные остатки</Link>
                      ) : null}
                    </div>
                  </div>
                )}
              </Card>
            </Section>

            <Section>
              <Card title="Операции магазина">
                <div className="meta-row">
                  {auth.hasPermission('workspace:read') ? (
                    <Link href={`${base}/today`}>Сегодня</Link>
                  ) : null}
                  {auth.hasPermission('operations:read') ? (
                    <Link href={`${base}/operations`}>Операции</Link>
                  ) : null}
                  <Link href={`${base}/orders`}>Очередь заказов</Link>
                  <Link href={`${base}/sales`}>Продажи</Link>
                  <Link href={`${base}/supplies`}>Поставки и приёмка</Link>
                  {auth.hasPermission('write-offs:read') ? <Link href={`${base}/write-offs`}>Списания</Link> : null}
                  {auth.hasPermission('transfers:read') ? <Link href={`${base}/transfers`}>Перемещения</Link> : null}
                  {auth.hasPermission('inventory-counts:read') ? <Link href={`${base}/inventory-counts`}>Инвентаризации</Link> : null}
                </div>
              </Card>
            </Section>
          </>
        ) : null}
      </PageContainer>
    </main>
  );
}
