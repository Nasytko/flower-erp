'use client';

import { FormEvent, useId, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { FloroBrand } from '@/components/floro-brand';
import { Field } from '@/components/layout/field';
import { DevEnvironmentBadge } from '@/components/dev-environment-banner';
import { getAppEnvironment } from '@/lib/app-environment';
import { formatApiErrorMessage } from '@/lib/format-api-error';
import { t } from '@/i18n/ru';
import { Button, Input } from '@flower/ui';
import { ApiClientError } from '@flower/api-client';

type LoginStep = 'credentials' | 'totp';

function GoogleAuthenticatorIcon() {
  return (
    <svg
      className="login-totp__icon"
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="4" y="4" width="40" height="40" rx="12" fill="#EEF2EC" />
      <path
        d="M24 11L30.5 19.5H17.5L24 11Z"
        fill="#4285F4"
      />
      <path
        d="M31 20.5L37 29H25L31 20.5Z"
        fill="#EA4335"
      />
      <path
        d="M17 20.5L11 29H23L17 20.5Z"
        fill="#FBBC04"
      />
      <path
        d="M24 29L30.5 37.5H17.5L24 29Z"
        fill="#34A853"
      />
      <circle cx="24" cy="24" r="4.5" fill="#1E332B" fillOpacity="0.12" />
    </svg>
  );
}

function LoginSteps({ step }: { step: LoginStep }) {
  const onTotp = step === 'totp';

  return (
    <ol className="login-steps" aria-label="Этапы входа">
      <li className={`login-steps__item${onTotp ? ' login-steps__item--done' : ' login-steps__item--active'}`}>
        <span className="login-steps__badge" aria-hidden="true">
          {onTotp ? '✓' : '1'}
        </span>
        <span className="login-steps__label">{t('loginStepCredentials')}</span>
      </li>
      <li className="login-steps__line" aria-hidden="true" />
      <li className={`login-steps__item${onTotp ? ' login-steps__item--active' : ''}`}>
        <span className="login-steps__badge" aria-hidden="true">
          2
        </span>
        <span className="login-steps__label">{t('loginStepTotp')}</span>
      </li>
    </ol>
  );
}

export default function LoginPage() {
  const auth = useAuth();
  const loginId = useId();
  const passwordId = useId();
  const totpId = useId();
  const [step, setStep] = useState<LoginStep>('credentials');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submitCredentials(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await auth.login(login, password);
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'TOTP_REQUIRED') {
        setStep('totp');
        setError(null);
      } else {
        setError(formatApiErrorMessage(err, t('invalidCredentials')));
      }
    } finally {
      setPending(false);
    }
  }

  async function submitTotp(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await auth.login(login, password, totpCode.trim());
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'TOTP_INVALID') {
        setError(t('totpInvalid'));
      } else if (err instanceof ApiClientError && err.code === 'TOTP_REQUIRED') {
        setError(t('totpRequired'));
      } else {
        setError(formatApiErrorMessage(err, t('invalidCredentials')));
      }
    } finally {
      setPending(false);
    }
  }

  function backToCredentials() {
    setStep('credentials');
    setTotpCode('');
    setError(null);
  }

  return (
    <main className="login-page">
      <div className="login-card">
        <h1 className="login-card__brand">
          <FloroBrand showTagline variant="dark" />
          <DevEnvironmentBadge environment={getAppEnvironment()} />
        </h1>

        <LoginSteps step={step} />

        {step === 'credentials' ? (
          <form className="login-card__form" onSubmit={submitCredentials}>
            <p className="login-card__subtitle">{t('loginSubtitle')}</p>
            <Field label={t('loginField')} hint={t('loginHint')} htmlFor={loginId} required>
              <Input
                id={loginId}
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                autoComplete="username"
                required
                placeholder="anna.florist"
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
            {error ? <p className="form-error">{error}</p> : null}
            <Button type="submit" disabled={pending} className="login-card__submit">
              {pending ? t('signingIn') : t('loginContinue')}
            </Button>
          </form>
        ) : (
          <form className="login-card__form" onSubmit={submitTotp}>
            <div className="login-totp">
              <div className="login-totp__success">
                <span className="login-totp__success-icon" aria-hidden="true">
                  ✓
                </span>
                <p>{t('loginPasswordAccepted')}</p>
              </div>

              <div className="login-totp__panel">
                <GoogleAuthenticatorIcon />
                <div className="login-totp__copy">
                  <strong>Google Authenticator</strong>
                  <p>{t('loginTotpIntro')}</p>
                </div>
              </div>

              <Field label={t('totpField')} hint={t('totpHint')} htmlFor={totpId} required>
                <div className="login-totp__code-wrap">
                  <Input
                    id={totpId}
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    autoComplete="one-time-code"
                    autoFocus
                    inputMode="numeric"
                    pattern="\d{6}"
                    maxLength={6}
                    required
                    placeholder="000000"
                    spellCheck={false}
                  />
                </div>
              </Field>
            </div>

            {error ? <p className="form-error">{error}</p> : null}
            <Button type="submit" disabled={pending || totpCode.length !== 6} className="login-card__submit">
              {pending ? t('signingIn') : t('signIn')}
            </Button>
            <button type="button" className="login-card__back" onClick={backToCredentials} disabled={pending}>
              {t('loginBack')}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
