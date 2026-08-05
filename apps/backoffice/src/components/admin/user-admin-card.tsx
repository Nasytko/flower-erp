'use client';

import { Button, Input } from '@flower/ui';
import { FancySelect } from '@/components/layout/fancy-select';
import { Field } from '@/components/layout/field';
import { DocRef } from '@/components/layout/doc-ref';
import { StatusBadge } from '@/components/layout/status-badge';
import { DeletionRequestButton } from '@/components/admin/deletion-request-button';
import { ROLE_LABELS_RU } from '@/lib/status-labels-ru';

export type UserAdminRow = {
  id: string;
  login: string;
  displayName: string;
  email: string | null;
  status: string;
  membershipStatus: string;
  failedLoginAttempts: number;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  mustChangePassword: boolean;
  passwordChangedAt: string;
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

type UserAdminCardProps = {
  organizationId: string;
  user: UserAdminRow;
  stores: StoreOption[];
  roleOptions: Array<{ value: string; label: string }>;
  primaryRole: string;
  busy: boolean;
  canManageRoles: boolean;
  canManageUsers: boolean;
  resetOpen: boolean;
  resetPassword: string;
  onRoleChange: (roleCode: string) => void;
  onStoreAccessModeChange: (mode: 'ALL_STORES' | 'SELECTED_STORES') => void;
  onToggleStore: (storeId: string, checked: boolean) => void;
  onBlock: () => void;
  onUnblock: () => void;
  onToggleReset: () => void;
  onResetPasswordChange: (value: string) => void;
  onResetSubmit: () => void;
};

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatWhenShort(iso: string | null): string {
  if (!iso) return 'не входил';
  const date = new Date(iso);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `сегодня, ${time}`;
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function userInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
}

function formatIp(ip: string | null | undefined): string {
  if (!ip) return '—';
  return ip.replace(/^::ffff:/i, '');
}

function parseBrowserLabel(ua: string | null | undefined): string {
  if (!ua) return '—';
  const value = ua.trim();
  if (/Edg\//.test(value)) return 'Microsoft Edge';
  if (/Chrome\//.test(value) && !/Edg\//.test(value)) return 'Google Chrome';
  if (/Firefox\//.test(value)) return 'Mozilla Firefox';
  if (/Safari\//.test(value) && !/Chrome\//.test(value)) return 'Safari';
  if (/OPR\//.test(value) || /Opera/.test(value)) return 'Opera';
  return value.length <= 40 ? value : `${value.slice(0, 37)}…`;
}

function storeAccessSummary(user: UserAdminRow): string {
  if (user.storeAccess.mode === 'ALL_STORES') return 'Все магазины';
  if (user.storeAccess.stores.length === 0) return 'Магазины не назначены';
  if (user.storeAccess.stores.length === 1) return user.storeAccess.stores[0]!.name;
  return `${user.storeAccess.stores.length} магазина`;
}

function primaryRoleLabel(user: UserAdminRow): string | null {
  const role = user.roles[0];
  if (!role) return null;
  return ROLE_LABELS_RU[role.code] ?? role.name;
}

export function UserAdminCard({
  organizationId,
  user,
  stores,
  roleOptions,
  primaryRole,
  busy,
  canManageRoles,
  canManageUsers,
  resetOpen,
  resetPassword,
  onRoleChange,
  onStoreAccessModeChange,
  onToggleStore,
  onBlock,
  onUnblock,
  onToggleReset,
  onResetPasswordChange,
  onResetSubmit,
}: UserAdminCardProps) {
  const isFlorist = primaryRole === 'FLORIST';
  const isDirector = primaryRole === 'DIRECTOR';
  const isLocked = Boolean(user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now());
  const roleLabel = primaryRoleLabel(user);
  const showStorePicker =
    isFlorist || (isDirector && user.storeAccess.mode === 'SELECTED_STORES');

  const metaParts = [
    roleLabel,
    storeAccessSummary(user),
    `Вход: ${formatWhenShort(user.lastLoginAt)}`,
    user.failedLoginAttempts > 0 ? `Неудачных входов: ${user.failedLoginAttempts}` : null,
  ].filter(Boolean);

  return (
    <article className="user-card">
      <header className="user-card__header">
        <div className="user-card__identity">
          <span className="user-card__avatar" aria-hidden="true">
            {userInitials(user.displayName)}
          </span>
          <div className="user-card__title-block">
            <div className="user-card__name-row">
              <strong className="user-card__name">{user.displayName}</strong>
              <DocRef>{user.login}</DocRef>
            </div>
            <div className="user-card__contact">{user.email ?? 'E-mail не указан'}</div>
            <p className="user-card__meta-line">{metaParts.join(' · ')}</p>
          </div>
        </div>
        <div className="user-card__badges">
          <StatusBadge status={user.status} />
          {user.membershipStatus !== 'ACTIVE' ? (
            <StatusBadge status={user.membershipStatus} />
          ) : null}
          {user.mustChangePassword ? (
            <span className="user-card__pill user-card__pill--warning">Сменить пароль</span>
          ) : null}
          {isLocked ? (
            <span className="user-card__pill user-card__pill--danger">
              Блок до {formatWhen(user.lockedUntil)}
            </span>
          ) : null}
        </div>
      </header>

      <details className="user-card__details">
        <summary className="user-card__details-summary">Сессия и безопасность</summary>
        <dl className="user-card__details-grid">
          <div className="user-card__detail">
            <dt>Последний вход</dt>
            <dd>{formatWhen(user.lastLoginAt)}</dd>
          </div>
          <div className="user-card__detail">
            <dt>Последняя активность</dt>
            <dd>{user.lastSession ? formatWhen(user.lastSession.lastUsedAt) : '—'}</dd>
          </div>
          <div className="user-card__detail">
            <dt>IP-адрес</dt>
            <dd>{formatIp(user.lastSession?.ipAddress)}</dd>
          </div>
          <div className="user-card__detail">
            <dt>Браузер</dt>
            <dd title={user.lastSession?.userAgent ?? undefined}>
              {parseBrowserLabel(user.lastSession?.userAgent)}
            </dd>
          </div>
          <div className="user-card__detail">
            <dt>Неудачные входы</dt>
            <dd>{user.failedLoginAttempts}</dd>
          </div>
          <div className="user-card__detail">
            <dt>Пароль изменён</dt>
            <dd>{formatWhen(user.passwordChangedAt)}</dd>
          </div>
        </dl>
      </details>

      {canManageRoles ? (
        <div className="user-card__manage">
          <Field label="Роль">
            <FancySelect
              value={primaryRole}
              onChange={onRoleChange}
              options={roleOptions}
              disabled={busy}
              searchable={false}
              aria-label="Роль пользователя"
            />
          </Field>

          {isDirector ? (
            <Field label="Доступ к магазинам">
              <FancySelect
                value={user.storeAccess.mode}
                onChange={(value) =>
                  onStoreAccessModeChange(value as 'ALL_STORES' | 'SELECTED_STORES')
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

          {showStorePicker ? (
            <div className="user-card__stores-field">
              <Field
                label={isFlorist ? 'Магазин флориста' : 'Выбранные магазины'}
                hint={isFlorist ? 'Минимум один магазин' : undefined}
              >
              {stores.length > 0 ? (
                <div className="user-card__stores">
                  {stores.map((store) => {
                    const checked = user.storeAccess.storeIds.includes(store.id);
                    return (
                      <label
                        key={store.id}
                        className={`user-card__store-chip${checked ? ' user-card__store-chip--active' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={busy}
                          onChange={(e) => onToggleStore(store.id, e.target.checked)}
                        />
                        <span className="user-card__store-chip-label">{store.name}</span>
                        <DocRef>{store.code}</DocRef>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p className="user-card__muted">В организации пока нет магазинов.</p>
              )}
              </Field>
            </div>
          ) : null}
        </div>
      ) : null}

      {canManageUsers ? (
        <footer className="user-card__actions">
          <div className="user-card__actions-primary">
            {user.status === 'ACTIVE' ? (
              <Button type="button" variant="secondary" disabled={busy} onClick={onBlock}>
                Заблокировать
              </Button>
            ) : null}
            {user.status === 'BLOCKED' ? (
              <Button type="button" disabled={busy} onClick={onUnblock}>
                Разблокировать
              </Button>
            ) : null}
            <Button type="button" variant="ghost" disabled={busy} onClick={onToggleReset}>
              {resetOpen ? 'Отмена' : 'Сбросить пароль'}
            </Button>
          </div>
          {user.status !== 'ARCHIVED' ? (
            <DeletionRequestButton
              organizationId={organizationId}
              entityType="USER"
              entityId={user.id}
              entityLabel={`${user.displayName} (${user.login})`}
              disabled={busy}
            />
          ) : null}
          {resetOpen ? (
            <form
              className="user-card__reset"
              onSubmit={(event) => {
                event.preventDefault();
                onResetSubmit();
              }}
            >
              <Input
                type="password"
                value={resetPassword}
                onChange={(e) => onResetPasswordChange(e.target.value)}
                placeholder="Новый пароль (мин. 10)"
                minLength={10}
                autoComplete="new-password"
              />
              <Button type="submit" disabled={busy}>
                Сохранить пароль
              </Button>
            </form>
          ) : null}
        </footer>
      ) : null}
    </article>
  );
}
