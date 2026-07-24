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

export default function ItemDetailPage() {
  const params = useParams<{ organizationId: string; itemId: string }>();
  const { organizationId, itemId } = params;
  const base = `/organizations/${organizationId}/master-data`;

  const [item, setItem] = useState<{
    id: string;
    name: string;
    code: string;
    itemType: string;
    status: string;
    categoryId: string;
    unitId: string;
    inventoryPolicyId: string;
    description: string | null;
    isSellable?: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getApiClient()
      .getItem(organizationId, itemId)
      .then((data) => {
        if (!cancelled) setItem(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Не удалось загрузить');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, itemId]);

  async function onArchive() {
    setError(null);
    try {
      const updated = await getApiClient().archiveItem(organizationId, itemId);
      setItem((current) => (current ? { ...current, status: updated.status } : current));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось архивировать');
    }
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title={item?.name ?? 'Товар'}
          description={item ? item.code : 'Загрузка…'}
          breadcrumbs={[
            { label: 'Организации', href: '/organizations' },
            { label: 'Организация', href: `/organizations/${organizationId}` },
            { label: 'Справочники', href: base },
            { label: 'Товары', href: `${base}/items` },
            { label: item?.name ?? 'Товар' },
          ]}
          actions={
            item && item.status !== 'ARCHIVED' ? (
              <Button variant="ghost" onClick={() => void onArchive()}>
                Архив
              </Button>
            ) : undefined
          }
        />
        {loading ? <LoadingState /> : null}
        {error ? <ErrorState message={error} /> : null}
        {item ? (
          <Section>
            <Card title="Карточка товара">
              <div className="meta-row">
                <StatusBadge status={item.itemType} />
                <StatusBadge status={item.status} />
                {item.isSellable ? <span className="sale-type-pill">Готовый букет</span> : null}
              </div>
              <p style={{ marginTop: 12, color: 'var(--color-muted)', fontSize: 'var(--text-sm)' }}>
                categoryId: {item.categoryId}
                <br />
                unitId: {item.unitId}
                <br />
                inventoryPolicyId: {item.inventoryPolicyId}
              </p>
              {item.description ? <p>{item.description}</p> : null}
            </Card>
          </Section>
        ) : null}
      </PageContainer>
    </main>
  );
}
