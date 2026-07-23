'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, Card } from '@flower/ui';
import { ApiClientError } from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';

type SaleRow = {
  id: string;
  number: string;
  status: string;
  type: string;
  netAmount: string;
  currencyCode: string;
  orderId: string | null;
  createdAt: string;
};

type ReadyOrder = { id: string; number: string; status: string };

export default function SalesPage() {
  const params = useParams<{ organizationId: string; storeId: string }>();
  const router = useRouter();
  const auth = useAuth();
  const { organizationId, storeId } = params;
  const base = `/organizations/${organizationId}/stores/${storeId}`;

  const [sales, setSales] = useState<SaleRow[]>([]);
  const [readyOrders, setReadyOrders] = useState<ReadyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const client = getApiClient();
      const [list, ready] = await Promise.all([
        client.listSales(organizationId, storeId),
        auth.hasPermission('orders:read')
          ? client.listOrders(organizationId, storeId, 'READY')
          : Promise.resolve([] as ReadyOrder[]),
      ]);
      setSales(list);
      setReadyOrders(ready);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось загрузить');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!auth.hasPermission('sales:read')) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, storeId, auth]);

  if (!auth.hasPermission('sales:read')) {
    return <p className="page-state">Доступ запрещён</p>;
  }

  const canCreate = auth.hasPermission('sales:create');

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Продажи"
          description="Коммерческая реализация: из готовых заказов или прямая продажа."
          breadcrumbs={[
            { label: 'Организации', href: '/organizations' },
            { label: 'Организация', href: `/organizations/${organizationId}` },
            { label: 'Магазин', href: base },
            { label: 'Продажи' },
          ]}
          actions={
            canCreate ? (
              <Button type="button" onClick={() => router.push(`${base}/sales/new`)}>
                Новая продажа
              </Button>
            ) : undefined
          }
        />

        <Section>
          {loading ? <LoadingState /> : null}
          {error ? <ErrorState message={error} /> : null}
        </Section>

        {readyOrders.length > 0 ? (
          <Section>
            <Card title="Готовые заказы без продажи">
              <p style={{ margin: '0 0 12px', color: 'var(--color-muted)', fontSize: 'var(--text-sm)' }}>
                Создайте продажу из заказа со статусом READY на карточке заказа («Создать продажу»).
              </p>
              <ul className="list-stack">
                {readyOrders.map((order) => (
                  <li key={order.id}>
                    <Link href={`${base}/orders/${order.id}`}>
                      <div className="meta-row">
                        <strong>{order.number}</strong>
                        <StatusBadge status={order.status} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </Section>
        ) : null}

        <Section>
          <Card title="Список продаж">
            {!loading && sales.length === 0 ? <EmptyState message="Продаж пока нет." /> : null}
            <ul className="list-stack">
              {sales.map((sale) => (
                <li key={sale.id}>
                  <Link href={`${base}/sales/${sale.id}`}>
                    <div className="meta-row">
                      <strong>{sale.number}</strong>
                      <StatusBadge status={sale.status} />
                      <StatusBadge status={sale.type} />
                      <span>
                        {sale.netAmount} {sale.currencyCode}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      </PageContainer>
    </main>
  );
}
