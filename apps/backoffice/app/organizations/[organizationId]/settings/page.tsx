'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useParams, usePathname } from 'next/navigation';
import { Card } from '@flower/ui';
import { useAuth } from '@/components/auth-provider';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { ErrorState } from '@/components/layout/states';
import {
  filterOrgSettingsNav,
  ORG_SETTINGS_ACCESS_PERMISSION,
  orgSettingsBreadcrumbs,
} from '@/lib/settings-nav';
import { resolveNavWorkspace, resolveStoreHomePath } from '@/lib/nav';

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
    () => filterOrgSettingsNav(auth.hasPermission, organizationId),
    [auth.hasPermission, organizationId],
  );

  const backToWorkHref = useMemo(() => {
    if (workspace.organizationId && workspace.storeId) {
      return resolveStoreHomePath(workspace.organizationId, workspace.storeId, auth.hasPermission);
    }
    return '/organizations';
  }, [auth.hasPermission, workspace.organizationId, workspace.storeId]);

  if (!auth.hasPermission(ORG_SETTINGS_ACCESS_PERMISSION)) {
    return (
      <main>
        <PageContainer>
          <ErrorState message="Раздел «Настройки» доступен только директору." />
        </PageContainer>
      </main>
    );
  }

  return (
    <main className="settings-hub">
      <PageContainer>
        <PageHeader
          title="Настройки ERP"
          description="Конфигурация организации: магазины, команда, учёт по партиям, интеграции."
          breadcrumbs={orgSettingsBreadcrumbs(organizationId).slice(1)}
          actions={
            <Link href={backToWorkHref} className="settings-hub__back-link">
              ← К работе
            </Link>
          }
        />

        <Section>
          <p className="field__hint">
            Операционный справочник (товары, поставщики) — в меню «Справочник». Здесь только администрирование ERP.
          </p>
        </Section>

        <div className="settings-hub__grid">
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
        </div>
      </PageContainer>
    </main>
  );
}
