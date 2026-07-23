'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card } from '@flower/ui';
import { ApiClientError } from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';

type PaymentRow = Awaited<ReturnType<ReturnType<typeof getApiClient>['listPayments']>>[number];

const STATUS_FILTERS = ['', 'DRAFT', 'COMPLETED', 'ANNULLED'] as const;

export default function PaymentsPage() {
  const params = useParams<{ organizationId: string; storeId: string }>();
  const auth = useAuth();
  const { organizationId, storeId } = params;
  const base = `/organizations/${organizationId}/stores/${storeId}`;

  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [status, setStatus] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(nextStatus = status) {
    setLoading(true);
    setError(null);
    try {
      const list = await getApiClient().listPayments(
        organizationId,
        storeId,
        nextStatus ? { status: nextStatus } : undefined,
      );
      setPayments(list);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось загрузить');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!auth.hasPermission('payments:read')) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, storeId, status, auth]);

  if (!auth.hasPermission('payments:read')) {
    return <p className="page-state">Доступ запрещён</p>;
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Платежи"
          description="Предоплаты по заказам и оплаты продаж."
          breadcrumbs={[
            { label: 'Организации', href: '/organizations' },
            { label: 'Организация', href: `/organizations/${organizationId}` },
            { label: 'Магазин', href: base },
            { label: 'Платежи' },
          ]}
        />

        <Section>
          <Card title="Фильтр">
            <div className="stack-form">
              <label>
                Статус{' '}
                <select value={status} onChange={(e) => setStatus(e.target.value)}>
                  {STATUS_FILTERS.map((value) => (
                    <option key={value || 'all'} value={value}>
                      {value || 'Все'}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </Card>
        </Section>

        <Section>
          {loading ? <LoadingState /> : null}
          {error ? <ErrorState message={error} /> : null}
          <Card title="Список платежей">
            {!loading && payments.length === 0 ? <EmptyState message="Платежей пока нет." /> : null}
            <ul className="list-stack">
              {payments.map((payment) => (
                <li key={payment.id}>
                  <Link href={`${base}/payments/${payment.id}`}>
                    <div className="meta-row">
                      <strong>{payment.number}</strong>
                      <StatusBadge status={payment.status} />
                      <StatusBadge status={payment.type} />
                      <span>
                        {payment.amount} {payment.currencyCode}
                      </span>
                      <span>{new Date(payment.receivedAt).toLocaleString()}</span>
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
