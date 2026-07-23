'use client';

import { FormEvent, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { t } from '@/i18n/ru';
import { Button, Input } from '@flower/ui';

export default function LoginPage() {
  const auth = useAuth();
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
        <label>
          {t('loginField')}
          <Input value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" />
        </label>
        <label>
          {t('passwordField')}
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        <label>
          {t('orgIdOptional')}
          <Input value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <Button type="submit" disabled={pending}>
          {pending ? t('signingIn') : t('signIn')}
        </Button>
      </form>
    </main>
  );
}
