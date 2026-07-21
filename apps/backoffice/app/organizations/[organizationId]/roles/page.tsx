'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { ErrorState, LoadingState } from '@/components/layout/states';

type RoleRow = {
  id: string;
  code: string;
  name: string;
  isSystem: boolean;
  permissions: string[];
};

export default function RolesPage() {
  const params = useParams<{ organizationId: string }>();
  const auth = useAuth();
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.hasPermission('roles:manage')) return;
    void getApiClient()
      .listRoles(params.organizationId)
      .then(setRoles)
      .catch(() => setError('Failed to load roles'))
      .finally(() => setLoading(false));
  }, [auth, params.organizationId]);

  if (!auth.hasPermission('roles:manage')) {
    return <p className="page-state">Access denied</p>;
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Roles"
          description="System role presets and permission bundles"
          breadcrumbs={[
            { label: 'Organizations', href: '/organizations' },
            { label: 'Organization', href: `/organizations/${params.organizationId}` },
            { label: 'Roles' },
          ]}
        />
        {loading ? <LoadingState /> : null}
        {error ? <ErrorState message={error} /> : null}
        <ul className="list-stack">
          {roles.map((role) => (
            <li key={role.id}>
              <strong>
                {role.name} ({role.code})
              </strong>
              {role.isSystem ? <span> — system</span> : null}
              <ul>
                {role.permissions.map((code) => (
                  <li key={code}>{code}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </PageContainer>
    </main>
  );
}
