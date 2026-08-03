'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { CourierProfileDto } from '@flower/api-client';
import { Button } from '@flower/ui';
import { DeletionRequestButton } from '@/components/admin/deletion-request-button';
import { useAuth } from '@/components/auth-provider';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { DataTable, DataTableCellPrimary } from '@/components/layout/data-table';
import { EntityListPanel } from '@/components/layout/entity-list-panel';
import { StatusBadge } from '@/components/layout/status-badge';
import { getApiClient } from '@/lib/api-client';
import { formatApiErrorMessage } from '@/lib/format-api-error';
import { storeSettingsBreadcrumbs } from '@/lib/settings-nav';

export default function CouriersPage() {
  const params = useParams<{ organizationId: string; storeId: string }>();
  const auth = useAuth();
  const { organizationId, storeId } = params;

  const [couriers, setCouriers] = useState<CourierProfileDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canManage = auth.hasPermission('delivery:manage-couriers');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await getApiClient().listCouriers(organizationId, storeId);
      setCouriers(list);
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось загрузить курьеров'));
    } finally {
      setLoading(false);
    }
  }, [organizationId, storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Курьеры"
          description="Профили курьеров создаются автоматически при назначении роли «Курьер» сотруднику."
          breadcrumbs={storeSettingsBreadcrumbs(organizationId, storeId, { label: 'Курьеры' })}
          actions={
            <Button type="button" variant="secondary" onClick={() => void load()} disabled={loading}>
              Обновить
            </Button>
          }
        />

        <Section>
          <EntityListPanel
            title="Курьеры"
            count={couriers.length}
            loading={loading}
            error={error}
            isEmpty={!loading && !error && couriers.length === 0}
            emptyMessage="Курьеров пока нет. Назначьте роль «Курьер» сотруднику в разделе «Пользователи»."
          >
            <DataTable
              rows={couriers}
              getRowKey={(c) => c.id}
              columns={[
                {
                  id: 'name',
                  header: 'Курьер',
                  render: (c) => <DataTableCellPrimary title={c.displayNameSnapshot} />,
                },
                {
                  id: 'phone',
                  header: 'Телефон',
                  render: (c) => c.phoneSnapshot ?? '—',
                },
                {
                  id: 'status',
                  header: 'Статус',
                  render: (c) => (
                    <div className="data-table__cell-badges">
                      <StatusBadge status={c.status} />
                    </div>
                  ),
                },
              ]}
              renderActions={(c) =>
                canManage && c.status !== 'ARCHIVED' ? (
                  <DeletionRequestButton
                    organizationId={organizationId}
                    entityType="COURIER"
                    entityId={c.id}
                    entityLabel={c.displayNameSnapshot}
                    storeId={storeId}
                    onRequested={() => void load()}
                  />
                ) : null
              }
            />
          </EntityListPanel>
        </Section>
      </PageContainer>
    </main>
  );
}
