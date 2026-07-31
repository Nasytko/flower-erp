'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { type AuditLogEntry } from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { EntityAuditHistory } from '@/components/audit/entity-audit-history';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { ErrorState, LoadingState } from '@/components/layout/states';
import { settingsBreadcrumbs } from '@/lib/settings-nav';

export default function AuditPage() {
  const params = useParams<{ organizationId: string }>();
  const auth = useAuth();
  const [rows, setRows] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.hasPermission('audit:read')) return;
    void getApiClient()
      .listAudit(params.organizationId, { limit: 100 })
      .then(setRows)
      .catch(() => setError('Не удалось загрузить журнал аудита'))
      .finally(() => setLoading(false));
  }, [auth, params.organizationId]);

  if (!auth.hasPermission('audit:read')) {
    return <p className="page-state">Доступ запрещён</p>;
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Журнал действий"
          description="Все действия пользователей по заказам, продажам, приёмкам и безопасности"
          breadcrumbs={settingsBreadcrumbs(params.organizationId, { label: 'Журнал действий' })}
        />
        {loading ? <LoadingState /> : null}
        {error ? <ErrorState message={error} /> : null}
        {!loading && !error ? (
          <EntityAuditHistory
            title="Последние события"
            entries={rows}
            emptyMessage="Событий пока нет."
          />
        ) : null}
      </PageContainer>
    </main>
  );
}
