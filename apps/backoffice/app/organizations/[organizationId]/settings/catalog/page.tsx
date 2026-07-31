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
  CATALOG_ADMIN_SECTIONS,
  ORG_SETTINGS_ACCESS_PERMISSION,
  catalogAdminBreadcrumbs,
} from '@/lib/settings-nav';

export default function CatalogAdminHubPage() {
  const params = useParams<{ organizationId: string }>();
  const auth = useAuth();
  const organizationId = params.organizationId;
  const base = `/organizations/${organizationId}/master-data`;

  const sections = useMemo(
    () => CATALOG_ADMIN_SECTIONS.filter((section) => auth.hasPermission(section.permission)),
    [auth],
  );

  if (!auth.hasPermission(ORG_SETTINGS_ACCESS_PERMISSION)) {
    return (
      <main>
        <PageContainer>
          <ErrorState message="Раздел доступен только директору." />
        </PageContainer>
      </main>
    );
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Учёт и цены"
          description="Администрирование справочника: политики партий и розничные цены."
          breadcrumbs={catalogAdminBreadcrumbs(organizationId)}
        />

        <Section>
          <ul className="list-stack">
            {sections.map((section) => (
              <li key={section.slug}>
                <Link href={`${base}/${section.slug}`}>
                  <Card title={section.title}>
                    <p style={{ margin: 0, color: 'var(--color-muted)', fontSize: 'var(--text-sm)' }}>
                      {section.description}
                    </p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      </PageContainer>
    </main>
  );
}
