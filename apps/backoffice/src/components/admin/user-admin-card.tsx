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
  return new Date(iso).toLocaleString('ru-RU');
}

function userInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
}

function shortUserAgent(ua: string | null | undefined): string {
  if (!ua) return '—';
  const trimmed = ua.trim();
  if (trimmed.length <= 48) return trimmed;
  return `${trimmed.slice(0, 45)}…`;
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
  const isLocked = Boolean(user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now());

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
              До {formatWhen(user.lockedUntil)}
            </span>
          ) : null}
        </div>
      </header>

      {user.roles.length > 0 ? (
        <div className="user-card__roles">
          {user.roles.map((role) => (
            <span key={role.code} className="user-card__role-chip">
              {ROLE_LABELS_RU[role.code] ?? role.name}
            </span>
          ))}
        </div>
      ) : (
        <p className="user-card__muted">Роль не назначена</p>
      )}

      <dl className="user-card__stats">
        <div className="user-card__stat">
          <dt>Последний вход</dt>
          <dd>{formatWhen(user.lastLoginAt)}</dd>
        </div>
        <div className="user-card__stat">
          <dt>IP</dt>
          <dd>{user.lastSession?.ipAddress ?? '—'}</dd>
        </div>
        <div className="user-card__stat">
          <dt>Сессия</dt>
          <dd>{user.lastSession ? formatWhen(user.lastSession.lastUsedAt) : '—'}</dd>
        </div>
        <div className="user-card__stat">
          <dt>Браузер</dt>
          <dd title={user.lastSession?.userAgent ?? undefined}>
            {shortUserAgent(user.lastSession?.userAgent)}
          </dd>
        </div>
        <div className="user-card__stat">
          <dt>Неудачные входы</dt>
          <dd>{user.failedLoginAttempts}</dd>
        </div>
        <div className="user-card__stat">
          <dt>Магазины</dt>
          <dd>
            {user.storeAccess.mode === 'ALL_STORES'
              ? 'Все'
              : user.storeAccess.stores.length > 0
                ? user.storeAccess.stores.map((s) => s.name).join(', ')
                : 'Не назначены'}
          </dd>
        </div>
      </dl>

      {canManageRoles ? (
        <div className="user-card__controls">
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

          {primaryRole === 'DIRECTOR' ? (
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

          {user.storeAccess.mode === 'SELECTED_STORES' || isFlorist || stores.length > 0 ? (
            <Field
              label={isFlorist ? 'Магазин флориста' : 'Выбранные магазины'}
              hint={isFlorist ? 'Минимум один магазин' : undefined}
            >
              <div className="user-card__stores">
                {stores.map((store) => {
                  const checked = user.storeAccess.storeIds.includes(store.id);
                  return (
                    <label key={store.id} className="user-card__store-option">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={busy}
                        onChange={(e) => onToggleStore(store.id, e.target.checked)}
                      />
                      <span>{store.name}</span>
                      <DocRef>{store.code}</DocRef>
                    </label>
                  );
                })}
                {stores.length === 0 ? (
                  <p className="user-card__muted">В организации пока нет магазинов.</p>
                ) : null}
              </div>
            </Field>
          ) : null}
        </div>
      ) : null}

      {canManageUsers ? (
        <footer className="user-card__actions">
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
          {user.status !== 'ARCHIVED' ? (
            <DeletionRequestButton
              organizationId={organizationId}
              entityType="USER"
              entityId={user.id}
              entityLabel={`${user.displayName} (${user.login})`}
              disabled={busy}
            />
          ) : null}
          <Button type="button" variant="ghost" disabled={busy} onClick={onToggleReset}>
            {resetOpen ? 'Отмена' : 'Сбросить пароль'}
          </Button>
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
