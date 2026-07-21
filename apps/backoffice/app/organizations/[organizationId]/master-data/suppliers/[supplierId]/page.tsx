'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card } from '@flower/ui';
import { ApiClientError } from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';

export default function SupplierDetailPage() {
  const params = useParams<{ organizationId: string; supplierId: string }>();
  const { organizationId, supplierId } = params;
  const base = `/organizations/${organizationId}/master-data`;

  const [supplier, setSupplier] = useState<{
    id: string;
    name: string;
    code: string;
    status: string;
    country: string | null;
    phone: string | null;
    email: string | null;
    contactPerson: string | null;
    comment: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getApiClient()
      .getSupplier(organizationId, supplierId)
      .then((data) => {
        if (!cancelled) setSupplier(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Failed to load');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, supplierId]);

  async function onArchive() {
    setError(null);
    try {
      const updated = await getApiClient().archiveSupplier(organizationId, supplierId);
      setSupplier((current) => (current ? { ...current, status: updated.status } : current));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Archive failed');
    }
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title={supplier?.name ?? 'Поставщик'}
          description={supplier ? supplier.code : 'Загрузка…'}
          breadcrumbs={[
            { label: 'Organizations', href: '/organizations' },
            { label: 'Organization', href: `/organizations/${organizationId}` },
            { label: 'Справочники', href: base },
            { label: 'Поставщики', href: `${base}/suppliers` },
            { label: supplier?.name ?? 'Поставщик' },
          ]}
          actions={
            supplier && supplier.status !== 'ARCHIVED' ? (
              <Button variant="ghost" onClick={() => void onArchive()}>
                Архив
              </Button>
            ) : undefined
          }
        />
        {loading ? <LoadingState /> : null}
        {error ? <ErrorState message={error} /> : null}
        {supplier ? (
          <Section>
            <Card title="Карточка поставщика">
              <div className="meta-row">
                <StatusBadge status={supplier.status} />
              </div>
              <p style={{ marginTop: 12, fontSize: 'var(--text-sm)', color: 'var(--color-muted)' }}>
                {supplier.country ? `Страна: ${supplier.country}` : 'Страна не указана'}
                <br />
                {supplier.contactPerson ? `Контакт: ${supplier.contactPerson}` : null}
                {supplier.phone ? (
                  <>
                    <br />
                    Тел: {supplier.phone}
                  </>
                ) : null}
                {supplier.email ? (
                  <>
                    <br />
                    Email: {supplier.email}
                  </>
                ) : null}
                {supplier.comment ? (
                  <>
                    <br />
                    {supplier.comment}
                  </>
                ) : null}
              </p>
            </Card>
          </Section>
        ) : null}
      </PageContainer>
    </main>
  );
}
