'use client';

import { FormEvent, useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { Field } from '@/components/layout/field';
import { getApiClient } from '@/lib/api-client';
import { resolveStoreHomePath } from '@/lib/nav';
import { setLastWorkspace } from '@/lib/workspace-context';
import { formatApiErrorMessage } from '@/lib/format-api-error';
import { Button, Input } from '@flower/ui';

export default function ChangePasswordPage() {
  const auth = useAuth();
  const router = useRouter();
  const currentId = useId();
  const nextId = useId();
  const confirmId = useId();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (newPassword.length < 10) {
      setError('Новый пароль должен быть не короче 10 символов');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Пароли не совпадают');
      return;
    }

    setPending(true);
    try {
      await getApiClient().changePassword({ currentPassword, newPassword });
      await auth.completePasswordChange();
      const me = await getApiClient().me();
      const hasPermission = (code: string) => me.permissions.includes(code);
      const stores = await getApiClient().listStores(me.organization.id, 1, 1);
      const first = stores.items[0];
      if (!first) {
        router.replace('/organizations');
        return;
      }
      setLastWorkspace({
        organizationId: me.organization.id,
        storeId: first.id,
        storeName: first.name,
      });
      router.replace(resolveStoreHomePath(me.organization.id, first.id, hasPermission));
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось сменить пароль'));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={onSubmit}>
        <h1 className="login-card__brand">Смена пароля</h1>
        <p className="login-card__subtitle">
          Администратор выдал временный пароль. Задайте свой — он понадобится при следующем входе.
        </p>
        <Field label="Текущий пароль" htmlFor={currentId} required>
          <Input
            id={currentId}
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>
        <Field label="Новый пароль" hint="Минимум 10 символов" htmlFor={nextId} required>
          <Input
            id={nextId}
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={10}
          />
        </Field>
        <Field label="Повторите новый пароль" htmlFor={confirmId} required>
          <Input
            id={confirmId}
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={10}
          />
        </Field>
        {error ? <p className="form-error">{error}</p> : null}
        <Button type="submit" disabled={pending}>
          {pending ? 'Сохранение…' : 'Сохранить пароль'}
        </Button>
      </form>
    </main>
  );
}
