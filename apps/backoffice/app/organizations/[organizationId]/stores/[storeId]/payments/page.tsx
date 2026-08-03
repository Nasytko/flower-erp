'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { Field } from '@/components/layout/field';
import { DataTable, DataTableCellPrimary } from '@/components/layout/data-table';
import { EntityListPanel } from '@/components/layout/entity-list-panel';
import { StatusBadge } from '@/components/layout/status-badge';
import { formatApiErrorMessage } from '@/lib/format-api-error';

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
      setError(formatApiErrorMessage(err, 'Не удалось загрузить платежи'));
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
          <EntityListPanel
            title="Платежи"
            count={payments.length}
            loading={loading}
            error={error}
            isEmpty={!loading && !error && payments.length === 0}
            emptyMessage="Платежей пока нет."
            toolbar={
              <div className="entity-list-panel__filters">
                <Field label="Статус">
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    aria-label="Фильтр платежей по статусу"
                  >
                    {STATUS_FILTERS.map((value) => (
                      <option key={value || 'all'} value={value}>
                        {value || 'Все'}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            }
          >
            <DataTable
              rows={payments}
              getRowKey={(payment) => payment.id}
              getRowHref={(payment) => `${base}/payments/${payment.id}`}
              columns={[
                {
                  id: 'amount',
                  header: 'Сумма',
                  render: (payment) => (
                    <DataTableCellPrimary
                      title={`${payment.amount} ${payment.currencyCode}`}
                      subtitle={new Date(payment.receivedAt).toLocaleString('ru-RU')}
                    />
                  ),
                },
                {
                  id: 'status',
                  header: 'Статус',
                  render: (payment) => (
                    <div className="data-table__cell-badges">
                      <StatusBadge status={payment.status} />
                    </div>
                  ),
                },
                {
                  id: 'type',
                  header: 'Тип',
                  render: (payment) => (
                    <div className="data-table__cell-badges">
                      <StatusBadge status={payment.type} />
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
