'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { Card } from '@flower/ui';
import { useAuth } from '@/components/auth-provider';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { MASTER_DATA_SECTIONS, masterDataBreadcrumbs } from '@/lib/settings-nav';

export default function MasterDataHubPage() {
  const params = useParams<{ organizationId: string }>();
  const auth = useAuth();
  const organizationId = params.organizationId;
  const base = `/organizations/${organizationId}/master-data`;

  const sections = useMemo(
    () => MASTER_DATA_SECTIONS.filter((section) => auth.hasPermission(section.permission)),
    [auth],
  );

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Справочники"
          description="Товары, категории, поставщики и розничные цены организации."
          breadcrumbs={masterDataBreadcrumbs(organizationId)}
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
