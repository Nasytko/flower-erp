'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card } from '@flower/ui';
import { ApiClientError, type TransferDto } from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';

type Warehouse = { id: string; name: string; code: string; isDefault: boolean };

export default function TransfersPage() {
  const params = useParams<{ organizationId: string; storeId: string }>();
  const auth = useAuth();
  const { organizationId, storeId } = params;
  const base = `/organizations/${organizationId}/stores/${storeId}`;
  const [docs, setDocs] = useState<TransferDto[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fromWarehouse = useMemo(() => warehouses.find((item) => item.isDefault) ?? warehouses[0] ?? null, [warehouses]);
  const toWarehouse = useMemo(() => warehouses.find((item) => item.id !== fromWarehouse?.id) ?? null, [fromWarehouse, warehouses]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = getApiClient();
      const [nextDocs, nextWarehouses] = await Promise.all([
        client.listTransfers(organizationId, storeId),
        client.listWarehouses(organizationId, storeId),
      ]);
      setDocs(nextDocs);
      setWarehouses(nextWarehouses);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load transfers');
    } finally {
      setLoading(false);
    }
  }, [organizationId, storeId]);

  useEffect(() => {
    if (!auth.hasPermission('transfers:read')) return;
    void load();
  }, [auth, load]);

  async function createDraft() {
    if (!fromWarehouse || !toWarehouse) return;
    setCreating(true);
    setError(null);
    try {
      const doc = await getApiClient().createTransfer(organizationId, storeId, {
        fromWarehouseId: fromWarehouse.id,
        toWarehouseId: toWarehouse.id,
      });
      window.location.href = `${base}/transfers/${doc.id}`;
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to create transfer');
    } finally {
      setCreating(false);
    }
  }

  if (!auth.hasPermission('transfers:read')) {
    return <main><PageContainer><ErrorState message="Access denied: transfers:read required." /></PageContainer></main>;
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Перемещения"
          description="Dispatch and receive inventory between warehouses."
          breadcrumbs={[{ label: 'Store', href: base }, { label: 'Перемещения' }]}
          actions={<Button type="button" variant="secondary" onClick={() => void load()}>Refresh</Button>}
        />

        {loading ? <LoadingState message="Loading transfers…" /> : null}
        {error ? <ErrorState message={error} /> : null}

        {!loading && !error ? (
          <>
            {auth.hasPermission('transfers:create') ? (
              <Section>
                <Card title="Создать перемещение">
                  <div className="meta-row">
                    <span>From: {fromWarehouse ? `${fromWarehouse.name} (${fromWarehouse.code})` : '—'}</span>
                    <span>To: {toWarehouse ? `${toWarehouse.name} (${toWarehouse.code})` : '—'}</span>
                    <Button type="button" onClick={() => void createDraft()} disabled={!fromWarehouse || !toWarehouse || creating}>
                      {creating ? 'Creating…' : 'Create draft'}
                    </Button>
                  </div>
                </Card>
              </Section>
            ) : null}

            <Section>
              <Card title={`Документы (${docs.length})`}>
                {docs.length === 0 ? (
                  <EmptyState message="No transfers yet." />
                ) : (
                  <ul className="stock-list">
                    {docs.map((doc) => (
                      <li key={doc.id} className="stock-row">
                        <div>
                          <strong><Link href={`${base}/transfers/${doc.id}`}>{doc.number}</Link></strong>
                          <div className="meta-row">
                            <StatusBadge status={doc.status} />
                            <span>{doc.fromWarehouseId} → {doc.toWarehouseId}</span>
                            <span>Items {doc.items.length}</span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </Section>
          </>
        ) : null}
      </PageContainer>
    </main>
  );
}
