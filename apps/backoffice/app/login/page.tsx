'use client';

import { FormEvent, useId, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { Field } from '@/components/layout/field';
import { DevEnvironmentBadge } from '@/components/dev-environment-banner';
import { getAppEnvironment } from '@/lib/app-environment';
import { formatApiErrorMessage } from '@/lib/format-api-error';
import { t } from '@/i18n/ru';
import { Button, Input } from '@flower/ui';
import { ApiClientError } from '@flower/api-client';

export default function LoginPage() {
  const auth = useAuth();
  const loginId = useId();
  const passwordId = useId();
  const totpId = useId();
  const orgId = useId();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await auth.login(
        login,
        password,
        totpCode.trim() || undefined,
        organizationId || undefined,
      );
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'TOTP_REQUIRED') {
        setError(t('totpRequired'));
      } else if (err instanceof ApiClientError && err.code === 'TOTP_INVALID') {
        setError(t('totpInvalid'));
      } else {
        setError(formatApiErrorMessage(err, t('invalidCredentials')));
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={onSubmit}>
        <h1 className="login-card__brand">
          {t('brand')}
          <DevEnvironmentBadge environment={getAppEnvironment()} />
        </h1>
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
        <Field label={t('totpField')} hint={t('totpHint')} htmlFor={totpId}>
          <Input
            id={totpId}
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            autoComplete="one-time-code"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            placeholder="123456"
            spellCheck={false}
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
