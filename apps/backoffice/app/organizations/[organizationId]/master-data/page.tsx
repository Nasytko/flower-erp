'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card } from '@flower/ui';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';

const SECTIONS = [
  { href: 'items', title: 'Товары', description: 'Единый справочник Item (FLOWER / MATERIAL)' },
  { href: 'retail-prices', title: 'Розничные цены', description: 'Цветы за штуку, материалы как услуга — по неделям' },
  { href: 'categories', title: 'Категории', description: 'Дерево категорий без ограничения глубины' },
  { href: 'suppliers', title: 'Поставщики', description: 'Поставщики организации' },
  { href: 'policies', title: 'Политики учета', description: 'InventoryPolicy без остатков и партий' },
] as const;

export default function MasterDataHubPage() {
  const params = useParams<{ organizationId: string }>();
  const organizationId = params.organizationId;
  const base = `/organizations/${organizationId}/master-data`;

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Справочники"
          description="Справочники и розничные цены."
          breadcrumbs={[
            { label: 'Организации', href: '/organizations' },
            { label: 'Организация', href: `/organizations/${organizationId}` },
            { label: 'Справочники' },
          ]}
        />

        <Section>
          <ul className="list-stack">
            {SECTIONS.map((section) => (
              <li key={section.href}>
                <Link href={`${base}/${section.href}`}>
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
