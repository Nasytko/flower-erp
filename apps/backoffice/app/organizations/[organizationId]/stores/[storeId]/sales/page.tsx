'use client';

import Link from 'next/link';
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

        <Section>
          {loading ? <LoadingState /> : null}
          {error ? <ErrorState message={error} /> : null}
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
          <Card title="История продаж">
            {!loading && sales.length === 0 ? (
              <EmptyState message="Продаж пока нет. Оформите новую продажу." />
            ) : null}
            <ul className="list-stack">
              {sales.map((sale) => (
                <li key={sale.id}>
                  <Link href={`${base}/sales/${sale.id}`}>
                    <div className="meta-row">
                      <div className="list-row__primary">
                        <strong>
                          {sale.netAmount} {sale.currencyCode}
                        </strong>
                        <DocRef>{sale.number}</DocRef>
                      </div>
                      <StatusBadge status={sale.status} />
                      <StatusBadge status={sale.type} />
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
