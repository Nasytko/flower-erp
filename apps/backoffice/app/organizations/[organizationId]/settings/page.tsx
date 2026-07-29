'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { Card } from '@flower/ui';
import { useAuth } from '@/components/auth-provider';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { ErrorState } from '@/components/layout/states';
import {
  filterSettingsNav,
  SETTINGS_ACCESS_PERMISSION,
} from '@/lib/settings-nav';
import { resolveNavWorkspace } from '@/lib/nav';
import { usePathname } from 'next/navigation';

export default function SettingsHubPage() {
  const params = useParams<{ organizationId: string }>();
  const pathname = usePathname();
  const auth = useAuth();
  const organizationId = params.organizationId;

  const workspace = useMemo(
    () => resolveNavWorkspace(pathname, auth.organization?.id),
    [pathname, auth.organization?.id],
  );

  const categories = useMemo(
    () =>
      filterSettingsNav(auth.hasPermission, organizationId, workspace.storeId),
    [auth.hasPermission, organizationId, workspace.storeId],
  );

  if (!auth.hasPermission(SETTINGS_ACCESS_PERMISSION)) {
    return (
      <main>
        <PageContainer>
          <ErrorState message="Раздел «Настройки» доступен только директору." />
        </PageContainer>
      </main>
    );
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Настройки"
          breadcrumbs={[
            { label: 'Организации', href: '/organizations' },
            { label: 'Настройки' },
          ]}
        />

        <Section>
          <p className="field__hint">
            Справочники, сотрудники, магазины и прочая конфигурация — только здесь.
          </p>
        </Section>

        {categories.map((category) => (
          <Section key={category.id}>
            <Card title={category.label}>
              <ul className="settings-links">
                {category.items.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className="settings-links__item">
                      <strong>{item.label}</strong>
                      {item.description ? <span>{item.description}</span> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </Section>
        ))}
      </PageContainer>
    </main>
  );
}
