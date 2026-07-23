import { Card } from '@flower/ui';
import { HealthPanel } from '@/components/health-panel';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';

export default function DashboardPage() {
  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Обзор"
          description="Пустая заготовка панели. Бизнес-виджеты появятся в следующих этапах."
          breadcrumbs={[{ label: 'Обзор' }]}
        />

        <Section>
          <Card title="Обзор">
            <p style={{ margin: 0, color: 'var(--color-muted)' }}>
              Первый вертикальный срез (Организация → Магазин → Склад) доступен в разделе «Организации».
            </p>
          </Card>
        </Section>

        <Section>
          <HealthPanel />
        </Section>
      </PageContainer>
    </main>
  );
}
