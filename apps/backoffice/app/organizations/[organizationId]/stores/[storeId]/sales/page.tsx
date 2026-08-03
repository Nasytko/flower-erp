'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, Card } from '@flower/ui';
import { ApiClientError } from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { DocRef } from '@/components/layout/doc-ref';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { DataTable, DataTableCellPrimary } from '@/components/layout/data-table';
import { EntityListPanel } from '@/components/layout/entity-list-panel';
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

export default function SalesPage() {
  const params = useParams<{ organizationId: string; storeId: string }>();
  const router = useRouter();
  const auth = useAuth();
  const { organizationId, storeId } = params;
  const base = `/organizations/${organizationId}/stores/${storeId}`;

  const [sales, setSales] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const list = await getApiClient().listSales(organizationId, storeId);
      setSales(list);
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
          breadcrumbs={[
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
          <div className="concept-callout">
            <strong>Продажа и заказ</strong>
            <p>
              <strong>Продажа</strong> — клиент получает букет сейчас в магазине.
            </p>
            <p>
              <strong>Заказ</strong> — готовим к времени. Когда заказ в колонке «Собранные»,
              оформите продажу прямо с карточки на календаре.
            </p>
          </div>
        </Section>

        {canCreate ? (
          <Section>
            <Card title="Быстрая продажа">
              <p className="form-lead">
                Соберите букет, укажите оплату и оформите продажу.
              </p>
              <Button type="button" onClick={() => router.push(`${base}/sales/new`)}>
                Новая продажа
              </Button>
            </Card>
          </Section>
        ) : null}

        <Section>
          <EntityListPanel
            title="История продаж"
            count={sales.length}
            loading={loading}
            error={error}
            isEmpty={!loading && !error && sales.length === 0}
            emptyMessage="Продаж пока нет. Оформите новую продажу."
          >
            <DataTable
              rows={sales}
              getRowKey={(sale) => sale.id}
              getRowHref={(sale) => `${base}/sales/${sale.id}`}
              columns={[
                {
                  id: 'amount',
                  header: 'Сумма',
                  render: (sale) => (
                    <DataTableCellPrimary
                      title={`${sale.netAmount} ${sale.currencyCode}`}
                    />
                  ),
                },
                {
                  id: 'number',
                  header: 'Номер',
                  render: (sale) => <DocRef>{sale.number}</DocRef>,
                },
                {
                  id: 'status',
                  header: 'Статус',
                  render: (sale) => (
                    <div className="data-table__cell-badges">
                      <StatusBadge status={sale.status} />
                    </div>
                  ),
                },
                {
                  id: 'type',
                  header: 'Тип',
                  render: (sale) => (
                    <div className="data-table__cell-badges">
                      <StatusBadge status={sale.type} />
                    </div>
                  ),
                },
              ]}
            />
          </EntityListPanel>
        </Section>
      </PageContainer>
    </main>
  );
}
