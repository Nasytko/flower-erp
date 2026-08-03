'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { CourierProfileDto } from '@flower/api-client';
import { Button, Card } from '@flower/ui';
import { DeletionRequestButton } from '@/components/admin/deletion-request-button';
import { useAuth } from '@/components/auth-provider';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/states';
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
          <Card title="Список курьеров">
            {loading ? <LoadingState /> : null}
            {error ? <ErrorState message={error} /> : null}

            {!loading && couriers.length === 0 ? (
              <EmptyState message="Курьеров пока нет. Назначьте роль «Курьер» сотруднику в разделе «Пользователи»." />
            ) : null}

            <ul className="list-stack">
              {couriers.map((c) => (
                <li key={c.id}>
                  <div className="meta-row">
                    <strong>{c.displayNameSnapshot}</strong>
                    {c.phoneSnapshot ? (
                      <span style={{ color: 'var(--color-muted)' }}>{c.phoneSnapshot}</span>
                    ) : null}
                    <StatusBadge status={c.status} />
                    {canManage && c.status !== 'ARCHIVED' ? (
                      <DeletionRequestButton
                        organizationId={organizationId}
                        entityType="COURIER"
                        entityId={c.id}
                        entityLabel={c.displayNameSnapshot}
                        storeId={storeId}
                        onRequested={() => void load()}
                      />
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      </PageContainer>
    </main>
  );
}
