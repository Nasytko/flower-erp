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
          title="Dashboard"
          description="Empty dashboard scaffold. Business widgets will arrive in later phases."
          breadcrumbs={[{ label: 'Dashboard' }]}
        />

        <Section>
          <Card title="Overview">
            <p style={{ margin: 0, color: 'var(--color-muted)' }}>
              First vertical slice (Organization → Store → Warehouse) is available under Organizations.
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
