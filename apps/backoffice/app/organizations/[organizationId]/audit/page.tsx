'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { ErrorState, LoadingState } from '@/components/layout/states';

type AuditRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorId: string | null;
  createdAt: string;
};

export default function AuditPage() {
  const params = useParams<{ organizationId: string }>();
  const auth = useAuth();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.hasPermission('audit:read')) return;
    void getApiClient()
      .listAudit(params.organizationId, { limit: 100 })
      .then(setRows)
      .catch(() => setError('Failed to load audit log'))
      .finally(() => setLoading(false));
  }, [auth, params.organizationId]);

  if (!auth.hasPermission('audit:read')) {
    return <p className="page-state">Access denied</p>;
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Audit log"
          description="Append-only security and business events"
          breadcrumbs={[
            { label: 'Organizations', href: '/organizations' },
            { label: 'Organization', href: `/organizations/${params.organizationId}` },
            { label: 'Audit' },
          ]}
        />
        {loading ? <LoadingState /> : null}
        {error ? <ErrorState message={error} /> : null}
        <ul className="list-stack">
          {rows.map((row) => (
            <li key={row.id}>
              <div className="meta-row">
                <strong>{row.action}</strong>
                <span>{row.entityType}</span>
                <span>{new Date(row.createdAt).toLocaleString()}</span>
              </div>
            </li>
          ))}
        </ul>
      </PageContainer>
    </main>
  );
}
