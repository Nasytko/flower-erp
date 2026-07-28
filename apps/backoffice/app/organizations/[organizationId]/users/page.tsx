'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
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
import { Field } from '@/components/layout/field';
import { FancySelect } from '@/components/layout/fancy-select';
import { useToast } from '@/components/ui/toast';
import {
  type FieldErrors,
  firstFieldError,
  hasFieldErrors,
  requiredText,
} from '@/lib/form-validation';
import { formatApiErrorMessage } from '@/lib/format-api-error';
import { ROLE_LABELS_RU } from '@/lib/status-labels-ru';

type UserRow = {
  id: string;
  login: string;
  displayName: string;
  email: string | null;
  status: string;
  membershipId: string;
  membershipStatus: string;
  failedLoginAttempts: number;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  roles: Array<{ code: string; name: string }>;
  storeAccess: {
    mode: 'ALL_STORES' | 'SELECTED_STORES';
    storeIds: string[];
    stores: Array<{ id: string; name: string; code: string }>;
  };
  lastSession: {
    ipAddress: string | null;
    lastUsedAt: string;
    userAgent: string | null;
  } | null;
};

type StoreOption = { id: string; name: string; code: string };

const SYSTEM_ROLES = ['DIRECTOR', 'FLORIST', 'COURIER'] as const;

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU');
}

function primaryRole(user: UserRow): string {
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

  const [users, setUsers] = useState<UserRow[]>([]);
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
              description: 'Яндекс.Карты, подсказки адресов, навигатор',
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

  const load = useCallback(async () => {
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
  }, [client, params.organizationId]);

  useEffect(() => {
    if (!auth.hasPermission('users:read')) return;
    void load();
  }, [auth, load]);

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

  async function changeRole(user: UserRow, roleCode: string) {
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
        const roleCodes = roleCode ? [roleCode] : [];
        await client.assignUserRoles(params.organizationId, user.id, roleCodes);
        toast.success('Роль обновлена');
        await load();
      } catch (err) {
        toast.error(formatApiErrorMessage(err, 'Не удалось назначить роль'));
      }
    });
  }

  async function changeStoreAccess(user: UserRow, mode: 'ALL_STORES' | 'SELECTED_STORES', storeIds: string[]) {
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

  async function toggleStore(user: UserRow, storeId: string, checked: boolean) {
    const current = new Set(user.storeAccess.storeIds);
    if (checked) current.add(storeId);
    else current.delete(storeId);
    const storeIds = [...current];
    await changeStoreAccess(user, 'SELECTED_STORES', storeIds);
  }

  if (!auth.hasPermission('users:read')) {
    return <p className="page-state">Доступ запрещён</p>;
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Пользователи"
          description="Участники организации, роли и привязка к магазинам"
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
              <form onSubmit={onCreate} className="stack-form" noValidate>
                <Field label="Логин" required error={fieldErrors.login}>
                  <Input
                    value={login}
                    onChange={(e) => setLogin(e.target.value)}
                    placeholder="anna.florist"
                    autoComplete="off"
                    required
                  />
                </Field>
                <Field
                  label="Пароль"
                  required
                  hint="Минимум 10 символов"
                  error={fieldErrors.password}
                >
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
                <Field label="Отображаемое имя" required error={fieldErrors.displayName}>
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Анна"
                    required
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
                <p className="field__hint">
                  После создания назначьте роль и магазин. Флорист должен быть закреплён минимум за
                  одним магазином.
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
            {users.length === 0 ? (
              <p className="field__hint">Пользователей пока нет.</p>
            ) : (
              <ul className="list-stack">
                {users.map((user) => {
                  const role = primaryRole(user);
                  const isFlorist = role === 'FLORIST';
                  const isLocked =
                    user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now();
                  const busy = pending[user.id] ?? false;

                  return (
                    <li key={user.id}>
                      <div className="stack-form" style={{ gap: 12 }}>
                        <div className="meta-row" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
                          <div>
                            <strong>
                              {user.displayName} ({user.login})
                            </strong>
                            <div className="field__hint">{user.email ?? 'E-mail не указан'}</div>
                          </div>
                          <StatusBadge status={user.status} />
                          {isLocked ? (
                            <span className="field__hint">
                              Блокировка до {formatWhen(user.lockedUntil)}
                            </span>
                          ) : null}
                        </div>

                        <div
                          style={{
                            display: 'grid',
                            gap: 8,
                            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                          }}
                        >
                          <div>
                            <div className="field__hint">Последний вход</div>
                            <div>{formatWhen(user.lastLoginAt)}</div>
                          </div>
                          <div>
                            <div className="field__hint">IP / сессия</div>
                            <div>{user.lastSession?.ipAddress ?? '—'}</div>
                            {user.lastSession ? (
                              <div className="field__hint">{formatWhen(user.lastSession.lastUsedAt)}</div>
                            ) : null}
                          </div>
                          <div>
                            <div className="field__hint">Неудачные попытки</div>
                            <div>{user.failedLoginAttempts}</div>
                          </div>
                          <div>
                            <div className="field__hint">Магазины</div>
                            <div>
                              {user.storeAccess.mode === 'ALL_STORES'
                                ? 'Все магазины'
                                : user.storeAccess.stores.length > 0
                                  ? user.storeAccess.stores.map((s) => s.name).join(', ')
                                  : 'Не назначены'}
                            </div>
                          </div>
                        </div>

                        {auth.hasPermission('roles:manage') ? (
                          <div className="stack-form">
                            <Field label="Роль">
                              <FancySelect
                                value={role}
                                onChange={(value) => void changeRole(user, value)}
                                options={roleOptions}
                                disabled={busy}
                                searchable={false}
                                aria-label="Роль пользователя"
                              />
                            </Field>

                            {role === 'DIRECTOR' ? (
                              <Field label="Доступ к магазинам">
                                <FancySelect
                                  value={user.storeAccess.mode}
                                  onChange={(value) =>
                                    void changeStoreAccess(
                                      user,
                                      value as 'ALL_STORES' | 'SELECTED_STORES',
                                      user.storeAccess.storeIds,
                                    )
                                  }
                                  options={[
                                    { value: 'ALL_STORES', label: 'Все магазины' },
                                    { value: 'SELECTED_STORES', label: 'Выбранные магазины' },
                                  ]}
                                  disabled={busy}
                                  searchable={false}
                                  aria-label="Режим доступа к магазинам"
                                />
                              </Field>
                            ) : null}

                            {user.storeAccess.mode === 'SELECTED_STORES' ||
                            isFlorist ||
                            stores.length > 0 ? (
                              <Field
                                label={isFlorist ? 'Магазин флориста' : 'Выбранные магазины'}
                                hint={
                                  isFlorist
                                    ? 'Флорист должен быть закреплён минимум за одним магазином'
                                    : 'Отметьте магазины до назначения роли флориста'
                                }
                              >
                                <div className="stack-form">
                                  {stores.map((store) => {
                                    const checked = user.storeAccess.storeIds.includes(store.id);
                                    return (
                                      <label key={store.id} className="meta-row">
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          disabled={busy}
                                          onChange={(e) =>
                                            void toggleStore(user, store.id, e.target.checked)
                                          }
                                        />
                                        <span>
                                          {store.name} ({store.code})
                                        </span>
                                      </label>
                                    );
                                  })}
                                  {stores.length === 0 ? (
                                    <p className="field__hint">В организации пока нет магазинов.</p>
                                  ) : null}
                                </div>
                              </Field>
                            ) : null}
                          </div>
                        ) : null}

                        {auth.hasPermission('users:manage') ? (
                          <div className="stack-form">
                            <div className="meta-row">
                              {user.status === 'ACTIVE' ? (
                                <Button
                                  type="button"
                                  variant="secondary"
                                  disabled={busy}
                                  onClick={() =>
                                    void withPending(user.id, async () => {
                                      await client.blockUser(params.organizationId, user.id);
                                      toast.success('Пользователь заблокирован');
                                      await load();
                                    })
                                  }
                                >
                                  Заблокировать
                                </Button>
                              ) : null}
                              {user.status === 'BLOCKED' ? (
                                <Button
                                  type="button"
                                  disabled={busy}
                                  onClick={() =>
                                    void withPending(user.id, async () => {
                                      await client.unblockUser(params.organizationId, user.id);
                                      toast.success('Пользователь разблокирован');
                                      await load();
                                    })
                                  }
                                >
                                  Разблокировать
                                </Button>
                              ) : null}
                              {user.status !== 'ARCHIVED' ? (
                                <Button
                                  type="button"
                                  variant="secondary"
                                  disabled={busy}
                                  onClick={() =>
                                    void withPending(user.id, async () => {
                                      if (
                                        !window.confirm(
                                          `Архивировать пользователя ${user.displayName}?`,
                                        )
                                      ) {
                                        return;
                                      }
                                      await client.archiveUser(params.organizationId, user.id);
                                      toast.success('Пользователь архивирован');
                                      await load();
                                    })
                                  }
                                >
                                  В архив
                                </Button>
                              ) : null}
                              <Button
                                type="button"
                                variant="secondary"
                                disabled={busy}
                                onClick={() => {
                                  setResetTargetId(resetTargetId === user.id ? null : user.id);
                                  setResetPassword('');
                                }}
                              >
                                Сбросить пароль
                              </Button>
                            </div>
                            {resetTargetId === user.id ? (
                              <form
                                className="meta-row"
                                onSubmit={(event) => {
                                  event.preventDefault();
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
                                  });
                                }}
                              >
                                <Input
                                  type="password"
                                  value={resetPassword}
                                  onChange={(e) => setResetPassword(e.target.value)}
                                  placeholder="Новый пароль (мин. 10)"
                                  minLength={10}
                                  autoComplete="new-password"
                                />
                                <Button type="submit" disabled={busy}>
                                  Сохранить пароль
                                </Button>
                              </form>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </Section>
      </PageContainer>
    </main>
  );
}
