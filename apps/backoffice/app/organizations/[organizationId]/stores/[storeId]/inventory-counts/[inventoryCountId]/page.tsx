'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { ApiClientError, type InventoryCountDto } from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';

export default function InventoryCountDetailPage() {
  const params = useParams<{ organizationId: string; storeId: string; inventoryCountId: string }>();
  const auth = useAuth();
  const { organizationId, storeId, inventoryCountId } = params;
  const base = `/organizations/${organizationId}/stores/${storeId}`;
  const [doc, setDoc] = useState<InventoryCountDto | null>(null);
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextDoc = await getApiClient().getInventoryCount(organizationId, storeId, inventoryCountId);
      setDoc(nextDoc);
      setDraftValues(
        Object.fromEntries(
          nextDoc.items.map((item) => [item.id, item.countedQuantity ?? item.expectedQuantity]),
        ),
      );
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load inventory count');
    } finally {
      setLoading(false);
    }
  }, [organizationId, storeId, inventoryCountId]);

  useEffect(() => {
    if (!auth.hasPermission('inventory-counts:read')) return;
    void load();
  }, [auth, load]);

  async function saveCount() {
    if (!doc) return;
    try {
      setDoc(await getApiClient().countInventory(organizationId, storeId, inventoryCountId, {
        expectedVersion: doc.version,
        items: doc.items.map((item) => ({
          inventoryCountItemId: item.id,
          countedQuantity: draftValues[item.id] ?? item.expectedQuantity,
        })),
      }));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to save counted quantities');
    }
  }

  async function postCount() {
    if (!doc) return;
    try {
      setDoc(await getApiClient().postInventoryCount(
        organizationId,
        storeId,
        inventoryCountId,
        { expectedVersion: doc.version },
        crypto.randomUUID(),
      ));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to post inventory count');
    }
  }

  async function cancelCount() {
    try {
      setDoc(await getApiClient().cancelInventoryCount(organizationId, storeId, inventoryCountId));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to cancel inventory count');
    }
  }

  if (!auth.hasPermission('inventory-counts:read')) {
    return <main><PageContainer><ErrorState message="Access denied: inventory-counts:read required." /></PageContainer></main>;
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title={doc ? doc.number : 'Inventory count'}
          description="Review snapshot lines, count, and post differences."
          breadcrumbs={[
            { label: 'Store', href: base },
            { label: 'Инвентаризации', href: `${base}/inventory-counts` },
            { label: doc?.number ?? 'Document' },
          ]}
          actions={
            <div className="page-header__actions">
              <Button type="button" variant="secondary" onClick={() => void load()}>Refresh</Button>
              {(doc?.status === 'DRAFT' || doc?.status === 'COUNTED') && auth.hasPermission('inventory-counts:count') ? <Button type="button" onClick={() => void saveCount()}>Save count</Button> : null}
              {doc?.status === 'COUNTED' && auth.hasPermission('inventory-counts:post') ? <Button type="button" onClick={() => void postCount()}>Post</Button> : null}
              {doc?.status !== 'POSTED' && doc?.status !== 'CANCELLED' && auth.hasPermission('inventory-counts:cancel') ? <Button type="button" variant="secondary" onClick={() => void cancelCount()}>Cancel</Button> : null}
            </div>
          }
        />

        {loading ? <LoadingState message="Loading inventory count…" /> : null}
        {error ? <ErrorState message={error} /> : null}

        {!loading && !error && doc ? (
          <>
            <Section>
              <Card title="Summary">
                <div className="meta-row">
                  <StatusBadge status={doc.status} />
                  <span>Warehouse {doc.warehouseId}</span>
                  <span>Version {doc.version}</span>
                </div>
              </Card>
            </Section>

            <Section>
              <Card title={`Lines (${doc.items.length})`}>
                {doc.items.length === 0 ? (
                  <EmptyState message="No snapshot lines were created." />
                ) : (
                  <ul className="stock-list">
                    {doc.items.map((item) => (
                      <li key={item.id} className="stock-row">
                        <div style={{ display: 'grid', gap: 8, width: '100%' }}>
                          <strong>{item.itemId}</strong>
                          <div className="meta-row">
                            <span>Expected {item.expectedQuantity}</span>
                            <span>Variance {item.varianceQuantity ?? '—'}</span>
                          </div>
                          {(doc.status === 'DRAFT' || doc.status === 'COUNTED') && auth.hasPermission('inventory-counts:count') ? (
                            <Input
                              value={draftValues[item.id] ?? ''}
                              onChange={(e) => setDraftValues((current) => ({ ...current, [item.id]: e.target.value }))}
                              placeholder="Counted quantity"
                            />
                          ) : (
                            <span>Counted {item.countedQuantity ?? '—'}</span>
                          )}
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
