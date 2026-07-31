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
  CATALOG_ACCESS_PERMISSION,
  CATALOG_SECTIONS,
  catalogBreadcrumbs,
  canOperateCatalog,
} from '@/lib/settings-nav';

export default function CatalogHubPage() {
  const params = useParams<{ organizationId: string }>();
  const auth = useAuth();
  const organizationId = params.organizationId;
  const base = `/organizations/${organizationId}/master-data`;

  const sections = useMemo(
    () => CATALOG_SECTIONS.filter((section) => auth.hasPermission(section.permission)),
    [auth],
  );

  if (!auth.hasPermission(CATALOG_ACCESS_PERMISSION)) {
    return (
      <main>
        <PageContainer>
          <ErrorState message="Нет доступа к справочнику." />
        </PageContainer>
      </main>
    );
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Справочник"
          description={
            canOperateCatalog(auth.hasPermission)
              ? 'Товары и поставщики для работы с цветами. Добавление новых позиций доступно здесь.'
              : 'Товары и поставщики организации.'
          }
          breadcrumbs={catalogBreadcrumbs(organizationId)}
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
