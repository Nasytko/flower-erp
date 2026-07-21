'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { Button, Card, Input } from '@flower/ui';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';

type UserRow = {
  id: string;
  login: string;
  displayName: string;
  status: string;
  membershipId: string;
};

export default function UsersPage() {
  const params = useParams<{ organizationId: string }>();
  const auth = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const rows = await getApiClient().listUsers(params.organizationId);
      setUsers(rows);
    } catch {
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!auth.hasPermission('users:read')) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth, params.organizationId]);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await getApiClient().createUser(params.organizationId, { login, password, displayName });
      setLogin('');
      setPassword('');
      setDisplayName('');
      await load();
    } catch {
      setError('Failed to create user');
    } finally {
      setCreating(false);
    }
  }

  if (!auth.hasPermission('users:read')) {
    return <p className="page-state">Access denied</p>;
  }

  const client = getApiClient();

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Users"
          description="Organization members and access"
          breadcrumbs={[
            { label: 'Organizations', href: '/organizations' },
            { label: 'Organization', href: `/organizations/${params.organizationId}` },
            { label: 'Users' },
          ]}
        />
        {loading ? <LoadingState /> : null}
        {error ? <ErrorState message={error} /> : null}

        {auth.hasPermission('users:manage') ? (
          <Section>
            <Card title="Create user">
              <form onSubmit={onCreate} className="stack-form">
                <Input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="Login" />
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password (min 10)"
                />
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Display name"
                />
                <Button type="submit" disabled={creating}>
                  Create
                </Button>
              </form>
            </Card>
          </Section>
        ) : null}

        <Section>
          <Card title="Members">
            <ul className="list-stack">
              {users.map((user) => (
                <li key={user.id}>
                  <div className="meta-row">
                    <strong>
                      {user.displayName} ({user.login})
                    </strong>
                    <StatusBadge status={user.status} />
                    {auth.hasPermission('users:manage') && user.status === 'ACTIVE' ? (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                          void client
                            .request(`/organizations/${params.organizationId}/users/${user.id}/block`, {
                              method: 'POST',
                            })
                            .then(() => load())
                        }
                      >
                        Block
                      </Button>
                    ) : null}
                    {auth.hasPermission('users:manage') && user.status === 'BLOCKED' ? (
                      <Button
                        type="button"
                        onClick={() =>
                          void client
                            .request(`/organizations/${params.organizationId}/users/${user.id}/unblock`, {
                              method: 'POST',
                            })
                            .then(() => load())
                        }
                      >
                        Unblock
                      </Button>
                    ) : null}
                    {auth.hasPermission('roles:manage') ? (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                          void client
                            .request(`/organizations/${params.organizationId}/users/${user.id}/roles`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ roleCodes: ['FLORIST'] }),
                            })
                            .then(() => load())
                        }
                      >
                        Assign FLORIST
                      </Button>
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
