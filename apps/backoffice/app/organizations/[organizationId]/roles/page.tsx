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
      .catch(() => setError('Не удалось загрузить роли'))
      .finally(() => setLoading(false));
  }, [auth, params.organizationId]);

  if (!auth.hasPermission('roles:manage')) {
    return <p className="page-state">Доступ запрещён</p>;
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Роли"
          description="Системные роли и наборы разрешений"
          breadcrumbs={[
            { label: 'Организации', href: '/organizations' },
            { label: 'Организация', href: `/organizations/${params.organizationId}` },
            { label: 'Роли' },
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
              {role.isSystem ? <span> — системная</span> : null}
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
