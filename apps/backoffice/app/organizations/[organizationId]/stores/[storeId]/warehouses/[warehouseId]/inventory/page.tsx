'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card } from '@flower/ui';
import { ApiClientError } from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';

export default function WarehouseInventoryPage() {
  const params = useParams<{ organizationId: string; storeId: string; warehouseId: string }>();
  const { organizationId, storeId, warehouseId } = params;
  const base = `/organizations/${organizationId}/stores/${storeId}`;

  const [balances, setBalances] = useState<
    Array<{ itemId: string; onHandQuantity: string; availableQuantity: string; item?: { name: string; code: string } }>
  >([]);
  const [batches, setBatches] = useState<
    Array<{
      id: string;
      remainingQuantity: string;
      status: string;
      item?: { name: string; code: string };
    }>
  >([]);
  const [movements, setMovements] = useState<
    Array<{ id: string; type: string; quantity: string; occurredAt: string; item?: { name: string; code: string } }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const client = getApiClient();
    Promise.all([
      client.listInventory(organizationId, storeId, warehouseId),
      client.listInventoryBatches(organizationId, storeId, warehouseId),
      client.listInventoryMovements(organizationId, storeId, warehouseId),
    ])
      .then(([b, ba, m]) => {
        if (cancelled) return;
        setBalances(b);
        setBatches(ba);
        setMovements(m);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiClientError ? err.message : 'Не удалось загрузить');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, storeId, warehouseId]);

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Складские остатки"
          description="Только чтение. Изменение остатков — только через posting документов."
          breadcrumbs={[
            { label: 'Магазин', href: base },
            { label: 'Остатки' },
          ]}
        />
        {loading ? <LoadingState /> : null}
        {error ? <ErrorState message={error} /> : null}
        {!loading && !error ? (
          <>
            <Section>
              <Card title="Остатки">
                {balances.length === 0 ? <EmptyState message="Нет остатков." /> : null}
                <ul className="list-stack">
                  {balances.map((row) => (
                    <li key={row.itemId}>
                      <div className="meta-row">
                        <strong>
                          {row.item?.name ?? row.itemId} ({row.item?.code})
                        </strong>
                        <span>на складе {row.onHandQuantity}</span>
                        <span>доступно {row.availableQuantity}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            </Section>
            <Section>
              <Card title="Партии">
                <ul className="list-stack">
                  {batches.map((batch) => (
                    <li key={batch.id}>
                      <div className="meta-row">
                        <span>{batch.item?.name ?? batch.id}</span>
                        <span>кол-во {batch.remainingQuantity}</span>
                        <StatusBadge status={batch.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            </Section>
            <Section>
              <Card title="Движения">
                <ul className="list-stack">
                  {movements.map((m) => (
                    <li key={m.id}>
                      <div className="meta-row">
                        <StatusBadge status={m.type} />
                        <span>{m.quantity}</span>
                        <span>{m.item?.name}</span>
                        <span style={{ fontSize: 'var(--text-xs)' }}>{m.occurredAt}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            </Section>
          </>
        ) : null}
      </PageContainer>
    </main>
  );
}
