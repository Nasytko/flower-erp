'use client';

import { FormEvent, useId, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { Field } from '@/components/layout/field';
import { t } from '@/i18n/ru';
import { Button, Input } from '@flower/ui';

export default function LoginPage() {
  const auth = useAuth();
  const loginId = useId();
  const passwordId = useId();
  const orgId = useId();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await auth.login(login, password, organizationId || undefined);
    } catch {
      setError(t('invalidCredentials'));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={onSubmit}>
        <h1 className="login-card__brand">{t('brand')}</h1>
        <p className="login-card__subtitle">{t('loginSubtitle')}</p>
        <Field label={t('loginField')} hint={t('loginHint')} htmlFor={loginId} required>
          <Input
            id={loginId}
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            autoComplete="username"
            required
            placeholder="например, anna.florist"
          />
        </Field>
        <Field label={t('passwordField')} hint={t('passwordHint')} htmlFor={passwordId} required>
          <Input
            id={passwordId}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            placeholder="••••••••"
          />
        </Field>
        <Field label={t('orgIdOptional')} hint={t('orgIdHint')} htmlFor={orgId}>
          <Input
            id={orgId}
            value={organizationId}
            onChange={(e) => setOrganizationId(e.target.value)}
            placeholder="Оставьте пустым, если у вас одна организация"
          />
        </Field>
        {error ? <p className="form-error">{error}</p> : null}
        <Button type="submit" disabled={pending}>
          {pending ? t('signingIn') : t('signIn')}
        </Button>
      </form>
    </main>
  );
}
