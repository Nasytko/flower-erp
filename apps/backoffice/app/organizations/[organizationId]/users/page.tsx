'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { Button, Card, Input } from '@flower/ui';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';
import { SettingsLinks } from '@/components/layout/settings-links';
import { useToast } from '@/components/ui/toast';
import { formatApiErrorMessage } from '@/lib/format-api-error';

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
  const toast = useToast();
  const base = `/organizations/${params.organizationId}`;
  const settingsLinks = useMemo(
    () =>
      [
        auth.hasPermission('users:read')
          ? {
              href: `${base}/roles`,
              label: 'Роли',
              description: 'Права доступа и системные роли',
            }
          : null,
        auth.hasPermission('customers:read')
          ? {
              href: `${base}/customers`,
              label: 'Клиенты',
              description: 'База клиентов организации',
            }
          : null,
        auth.hasPermission('audit:read')
          ? {
              href: `${base}/audit`,
              label: 'Журнал действий',
              description: 'Системный аудит изменений',
            }
          : null,
        auth.hasPermission('organization:read')
          ? {
              href: `${base}/integrations`,
              label: 'Карты и навигация',
              description: 'Яндекс.Карты, подсказки адресов, навигатор',
            }
          : null,
        auth.hasPermission('sessions:read')
          ? {
              href: '/sessions',
              label: 'Сессии',
              description: 'Активные входы в систему',
            }
          : null,
      ].filter((item): item is { href: string; label: string; description: string } => item != null),
    [auth, base],
  );

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const rows = await getApiClient().listUsers(params.organizationId);
      setUsers(rows);
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось загрузить пользователей'));
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
      toast.success('Пользователь создан');
      await load();
    } catch (err) {
      const message = formatApiErrorMessage(err, 'Не удалось создать пользователя');
      setError(message);
      toast.error(message);
    } finally {
      setCreating(false);
    }
  }

  if (!auth.hasPermission('users:read')) {
    return <p className="page-state">Доступ запрещён</p>;
  }

  const client = getApiClient();

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Пользователи"
          description="Участники организации и их доступ"
          breadcrumbs={[
            { label: 'Организации', href: '/organizations' },
            { label: 'Организация', href: `/organizations/${params.organizationId}` },
            { label: 'Пользователи' },
          ]}
        />
        {loading ? <LoadingState /> : null}
        {error ? <ErrorState message={error} /> : null}

        {settingsLinks.length > 0 ? (
          <Section>
            <SettingsLinks links={settingsLinks} />
          </Section>
        ) : null}

        {auth.hasPermission('users:manage') ? (
          <Section>
            <Card title="Создать пользователя">
              <form onSubmit={onCreate} className="stack-form">
                <Input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="Логин" />
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Пароль (мин. 10 символов)"
                />
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Отображаемое имя"
                />
                <p className="field-hint">
                  При первом входе пользователь задаст свой пароль и введёт роль латиницей: director,
                  florist или courier.
                </p>
                <Button type="submit" disabled={creating}>
                  {creating ? 'Создание…' : 'Создать'}
                </Button>
              </form>
            </Card>
          </Section>
        ) : null}

        <Section>
          <Card title="Участники">
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
                        Заблокировать
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
                        Разблокировать
                      </Button>
                    ) : null}
                    {auth.hasPermission('roles:manage') ? (
                      <>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() =>
                            void client
                              .request(`/organizations/${params.organizationId}/users/${user.id}/roles`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ roleCodes: ['DIRECTOR'] }),
                              })
                              .then(() => load())
                          }
                        >
                          Директор
                        </Button>
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
                          Флорист
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() =>
                            void client
                              .request(`/organizations/${params.organizationId}/users/${user.id}/roles`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ roleCodes: ['COURIER'] }),
                              })
                              .then(() => load())
                          }
                        >
                          Курьер
                        </Button>
                      </>
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
