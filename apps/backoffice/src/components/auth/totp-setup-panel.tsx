'use client';

import { FormEvent, useEffect, useId, useState } from 'react';
import QRCode from 'qrcode';
import { Button, Input } from '@flower/ui';
import { getApiClient } from '@/lib/api-client';
import { formatApiErrorMessage } from '@/lib/format-api-error';
import { Field } from '@/components/layout/field';
import { useToast } from '@/components/ui/toast';

type TotpSetupPanelProps = {
  totpEnabled: boolean;
  onChanged: () => Promise<void>;
};

export function TotpSetupPanel({ totpEnabled, onChanged }: TotpSetupPanelProps) {
  const toast = useToast();
  const codeId = useId();
  const passwordId = useId();
  const disableCodeId = useId();

  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState<{ otpauthUrl: string; secret: string } | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [confirmCode, setConfirmCode] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!setup?.otpauthUrl) {
      setQrDataUrl(null);
      return;
    }
    void QRCode.toDataURL(setup.otpauthUrl, { width: 200, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [setup?.otpauthUrl]);

  async function onStartSetup() {
    setBusy(true);
    setError(null);
    try {
      const result = await getApiClient().setupTotp();
      setSetup(result);
      setConfirmCode('');
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось начать настройку'));
    } finally {
      setBusy(false);
    }
  }

  async function onConfirmSetup(event: FormEvent) {
    event.preventDefault();
    if (!confirmCode.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await getApiClient().confirmTotp(confirmCode.trim());
      setSetup(null);
      setConfirmCode('');
      toast.success('Двухфакторная аутентификация включена');
      await onChanged();
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Неверный код подтверждения'));
    } finally {
      setBusy(false);
    }
  }

  async function onDisable(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await getApiClient().disableTotp({
        password: disablePassword,
        totpCode: disableCode.trim(),
      });
      setDisablePassword('');
      setDisableCode('');
      toast.success('Двухфакторная аутентификация отключена');
      await onChanged();
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось отключить 2FA'));
    } finally {
      setBusy(false);
    }
  }

  if (totpEnabled) {
    return (
      <div>
        <p className="field__hint" style={{ marginTop: 0 }}>
          Двухфакторная аутентификация включена. При входе нужен код из Google Authenticator
          (или другого TOTP-приложения).
        </p>
        <form onSubmit={onDisable} className="form-grid" style={{ marginTop: 16 }}>
          <Field label="Текущий пароль" htmlFor={passwordId} required>
            <Input
              id={passwordId}
              type="password"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>
          <Field label="Код из приложения" htmlFor={disableCodeId} required>
            <Input
              id={disableCodeId}
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              required
            />
          </Field>
          {error ? <p className="form-error">{error}</p> : null}
          <Button type="submit" variant="secondary" disabled={busy}>
            Отключить 2FA
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div>
      <p className="field__hint" style={{ marginTop: 0 }}>
        Подключите Google Authenticator или аналог — при входе вместо поля «роль» будет запрашиваться
        6-значный код.
      </p>
      {!setup ? (
        <Button type="button" onClick={() => void onStartSetup()} disabled={busy} style={{ marginTop: 12 }}>
          Подключить authenticator
        </Button>
      ) : (
        <form onSubmit={onConfirmSetup} className="form-grid" style={{ marginTop: 16 }}>
          {qrDataUrl ? (
            <div>
              <img src={qrDataUrl} alt="QR-код для Google Authenticator" width={200} height={200} />
            </div>
          ) : null}
          <p className="field__hint" style={{ margin: 0 }}>
            Отсканируйте QR-код или введите ключ вручную:{' '}
            <code style={{ wordBreak: 'break-all' }}>{setup.secret}</code>
          </p>
          <Field label="Код из приложения" htmlFor={codeId} required>
            <Input
              id={codeId}
              value={confirmCode}
              onChange={(e) => setConfirmCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              required
              placeholder="123456"
            />
          </Field>
          {error ? <p className="form-error">{error}</p> : null}
          <div className="page-header__actions">
            <Button type="submit" disabled={busy || confirmCode.length !== 6}>
              Подтвердить
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setSetup(null)}>
              Отмена
            </Button>
          </div>
        </form>
      )}
      {error && !setup ? <p className="form-error">{error}</p> : null}
    </div>
  );
}