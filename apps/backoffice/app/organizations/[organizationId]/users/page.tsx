'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { Button, Card, Input } from '@flower/ui';
import { UserAdminCard, type UserAdminRow } from '@/components/admin/user-admin-card';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { ErrorState, LoadingState } from '@/components/layout/states';
import { SettingsLinks } from '@/components/layout/settings-links';
import { Field } from '@/components/layout/field';
import { useToast } from '@/components/ui/toast';
import {
  type FieldErrors,
  firstFieldError,
  hasFieldErrors,
  requiredText,
} from '@/lib/form-validation';
import { formatApiErrorMessage } from '@/lib/format-api-error';
import { ROLE_LABELS_RU } from '@/lib/status-labels-ru';

type StoreOption = { id: string; name: string; code: string };

const SYSTEM_ROLES = ['DIRECTOR', 'FLORIST', 'COURIER'] as const;

function primaryRole(user: UserAdminRow): string {
  for (const code of SYSTEM_ROLES) {
    if (user.roles.some((role) => role.code === code)) return code;
  }
  return user.roles[0]?.code ?? '';
}

export default function UsersPage() {
  const params = useParams<{ organizationId: string }>();
  const auth = useAuth();
  const toast = useToast();
  const client = getApiClient();

  const [users, setUsers] = useState<UserAdminRow[]>([]);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [resetTargetId, setResetTargetId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});

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
              description: 'Яндекс.Карты, подсказки адресов',
            }
          : null,
      ].filter((item): item is { href: string; label: string; description: string } => item != null),
    [auth, base],
  );

  const roleOptions = useMemo(
    () => [
      { value: '', label: 'Без роли' },
      ...SYSTEM_ROLES.map((code) => ({
        value: code,
        label: ROLE_LABELS_RU[code] ?? code,
      })),
    ],
    [],
  );

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [userRows, storeRows] = await Promise.all([
        client.listUsers(params.organizationId),
        client.listStores(params.organizationId, 1, 100),
      ]);
      setUsers(userRows);
      setStores(storeRows.items);
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

  async function withPending(userId: string, action: () => Promise<void>) {
    setPending((prev) => ({ ...prev, [userId]: true }));
    try {
      await action();
    } finally {
      setPending((prev) => ({ ...prev, [userId]: false }));
    }
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    const errors: FieldErrors = {
      login: requiredText(login, 'Укажите логин'),
      password: requiredText(password, 'Укажите пароль'),
      displayName: requiredText(displayName, 'Укажите отображаемое имя'),
    };
    if (password.trim() && password.trim().length < 10) {
      errors.password = 'Пароль должен быть не короче 10 символов';
    }
    setFieldErrors(errors);
    if (hasFieldErrors(errors)) {
      const message = firstFieldError(errors);
      setError(message);
      if (message) toast.error(message);
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await client.createUser(params.organizationId, {
        login,
        password,
        displayName,
        ...(email.trim() ? { email: email.trim() } : {}),
      });
      setLogin('');
      setPassword('');
      setDisplayName('');
      setEmail('');
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

  async function changeRole(user: UserAdminRow, roleCode: string) {
    if (roleCode === 'FLORIST') {
      const hasStores =
        user.storeAccess.mode === 'SELECTED_STORES' && user.storeAccess.storeIds.length > 0;
      if (!hasStores) {
        toast.error('Сначала выберите магазин для флориста');
        return;
      }
    }

    await withPending(user.id, async () => {
      try {
        await client.assignUserRoles(params.organizationId, user.id, roleCode ? [roleCode] : []);
        toast.success('Роль обновлена');
        await load();
      } catch (err) {
        toast.error(formatApiErrorMessage(err, 'Не удалось назначить роль'));
      }
    });
  }

  async function changeStoreAccess(
    user: UserAdminRow,
    mode: 'ALL_STORES' | 'SELECTED_STORES',
    storeIds: string[],
  ) {
    await withPending(user.id, async () => {
      try {
        await client.setUserStoreAccess(params.organizationId, user.id, { mode, storeIds });
        toast.success('Привязка к магазинам обновлена');
        await load();
      } catch (err) {
        toast.error(formatApiErrorMessage(err, 'Не удалось обновить магазины'));
      }
    });
  }

  if (!auth.hasPermission('users:read')) {
    return <p className="page-state">Доступ запрещён</p>;
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Пользователи"
          breadcrumbs={[
            { label: 'Организации', href: '/organizations' },
            { label: 'Организация', href: base },
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
            <Card title="Новый пользователь">
              <form onSubmit={onCreate} className="stack-form admin-create-user" noValidate>
                <div className="sale-custom-meta">
                  <Field label="Имя" required error={fieldErrors.displayName}>
                    <Input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Анна"
                      required
                    />
                  </Field>
                  <Field label="Логин" required error={fieldErrors.login}>
                    <Input
                      value={login}
                      onChange={(e) => setLogin(e.target.value)}
                      placeholder="anna.florist"
                      autoComplete="off"
                      required
                    />
                  </Field>
                </div>
                <div className="sale-custom-meta">
                  <Field label="Пароль" required error={fieldErrors.password}>
                    <Input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••"
                      autoComplete="new-password"
                      required
                      minLength={10}
                    />
                  </Field>
                  <Field label="E-mail">
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="anna@example.com"
                      autoComplete="off"
                    />
                  </Field>
                </div>
                <Button type="submit" disabled={creating}>
                  {creating ? 'Создание…' : 'Создать'}
                </Button>
              </form>
            </Card>
          </Section>
        ) : null}

        <Section>
          <Card title={`Участники (${users.length})`}>
            {users.length === 0 ? (
              <p className="field__hint">Пользователей пока нет.</p>
            ) : (
              <div className="user-card-list">
                {users.map((user) => (
                  <UserAdminCard
                    key={user.id}
                    user={user}
                    stores={stores}
                    roleOptions={roleOptions}
                    primaryRole={primaryRole(user)}
                    busy={pending[user.id] ?? false}
                    canManageRoles={auth.hasPermission('roles:manage')}
                    canManageUsers={auth.hasPermission('users:manage')}
                    resetOpen={resetTargetId === user.id}
                    resetPassword={resetPassword}
                    onRoleChange={(value) => void changeRole(user, value)}
                    onStoreAccessModeChange={(mode) =>
                      void changeStoreAccess(user, mode, user.storeAccess.storeIds)
                    }
                    onToggleStore={(storeId, checked) => {
                      const current = new Set(user.storeAccess.storeIds);
                      if (checked) current.add(storeId);
                      else current.delete(storeId);
                      void changeStoreAccess(user, 'SELECTED_STORES', [...current]);
                    }}
                    onBlock={() =>
                      void withPending(user.id, async () => {
                        await client.blockUser(params.organizationId, user.id);
                        toast.success('Пользователь заблокирован');
                        await load();
                      })
                    }
                    onUnblock={() =>
                      void withPending(user.id, async () => {
                        await client.unblockUser(params.organizationId, user.id);
                        toast.success('Пользователь разблокирован');
                        await load();
                      })
                    }
                    onArchive={() =>
                      void withPending(user.id, async () => {
                        if (!window.confirm(`Архивировать пользователя ${user.displayName}?`)) {
                          return;
                        }
                        await client.archiveUser(params.organizationId, user.id);
                        toast.success('Пользователь архивирован');
                        await load();
                      })
                    }
                    onToggleReset={() => {
                      setResetTargetId(resetTargetId === user.id ? null : user.id);
                      setResetPassword('');
                    }}
                    onResetPasswordChange={setResetPassword}
                    onResetSubmit={() =>
                      void withPending(user.id, async () => {
                        if (resetPassword.trim().length < 10) {
                          toast.error('Пароль должен быть не короче 10 символов');
                          return;
                        }
                        await client.resetUserPassword(
                          params.organizationId,
                          user.id,
                          resetPassword,
                        );
                        toast.success('Пароль сброшен');
                        setResetTargetId(null);
                        setResetPassword('');
                      })
                    }
                  />
                ))}
              </div>
            )}
          </Card>
        </Section>
      </PageContainer>
    </main>
  );
}
