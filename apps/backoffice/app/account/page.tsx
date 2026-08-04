'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { TotpSetupPanel } from '@/components/auth/totp-setup-panel';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { ThemeSelector } from '@/components/theme/theme-selector';
import { Card } from '@flower/ui';
import { getApiClient } from '@/lib/api-client';

export default function AccountSettingsPage() {
  const auth = useAuth();
  const user = auth.user;
  const [totpEnabled, setTotpEnabled] = useState<boolean | null>(null);

  const reloadTotpStatus = useCallback(async () => {
    const me = await getApiClient().me();
    setTotpEnabled(me.totpEnabled);
  }, []);

  useEffect(() => {
    void reloadTotpStatus();
  }, [reloadTotpStatus]);

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Мой профиль"
          description="Личные настройки учётной записи."
          breadcrumbs={[{ label: 'Профиль' }]}
        />

        <Section>
          <Card title="Учётная запись">
            <dl className="meta-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
              <div>
                <dt className="field__hint">Имя</dt>
                <dd>{user?.displayName ?? '—'}</dd>
              </div>
              <div>
                <dt className="field__hint">Логин</dt>
                <dd>{user?.login ?? '—'}</dd>
              </div>
            </dl>
          </Card>
        </Section>

        <Section>
          <Card title="Двухфакторная аутентификация">
            {totpEnabled === null ? (
              <p className="field__hint">Загрузка…</p>
            ) : (
              <TotpSetupPanel totpEnabled={totpEnabled} onChanged={reloadTotpStatus} />
            )}
          </Card>
        </Section>

        <Section>
          <Card title="Внешний вид">
            <ThemeSelector />
          </Card>
        </Section>

        <Section>
          <Card title="Безопасность">
            <p className="field__hint" style={{ marginTop: 0 }}>
              Смена пароля доступна в любой момент. При первом входе система может потребовать смену пароля.
            </p>
            <Link href="/change-password">Сменить пароль</Link>
          </Card>
        </Section>

        {auth.organization ? (
          <Section>
            <p className="field__hint">
              Настройки организации и магазина — в разделе «Настройки ERP» (только для директора).
            </p>
          </Section>
        ) : null}
      </PageContainer>
    </main>
  );
}
