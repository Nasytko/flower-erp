'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { ApiClientError, type WriteOffDto, type WriteOffReason } from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';

type Warehouse = {
  id: string;
  name: string;
  code: string;
  isDefault: boolean;
};

const REASONS: WriteOffReason[] = [
  'WILTED',
  'BROKEN',
  'DAMAGED',
  'EXPIRED',
  'QUALITY_ISSUE',
  'THEFT',
  'INTERNAL_USE',
  'OTHER',
];

export default function WriteOffsPage() {
  const params = useParams<{ organizationId: string; storeId: string }>();
  const auth = useAuth();
  const { organizationId, storeId } = params;
  const base = `/organizations/${organizationId}/stores/${storeId}`;
  const [docs, setDocs] = useState<WriteOffDto[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [reason, setReason] = useState<WriteOffReason>('WILTED');
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaultWarehouse = useMemo(
    () => warehouses.find((item) => item.isDefault) ?? warehouses[0] ?? null,
    [warehouses],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = getApiClient();
      const [nextDocs, nextWarehouses] = await Promise.all([
        client.listWriteOffs(organizationId, storeId),
        client.listWarehouses(organizationId, storeId),
      ]);
      setDocs(nextDocs);
      setWarehouses(nextWarehouses);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load write-offs');
    } finally {
      setLoading(false);
    }
  }, [organizationId, storeId]);

  useEffect(() => {
    if (!auth.hasPermission('write-offs:read')) return;
    void load();
  }, [auth, load]);

  async function createDraft() {
    if (!defaultWarehouse) return;
    setCreating(true);
    setError(null);
    try {
      const doc = await getApiClient().createWriteOff(organizationId, storeId, {
        warehouseId: defaultWarehouse.id,
        reason,
        comment: comment || undefined,
      });
      window.location.href = `${base}/write-offs/${doc.id}`;
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to create write-off');
    } finally {
      setCreating(false);
    }
  }

  if (!auth.hasPermission('write-offs:read')) {
    return <main><PageContainer><ErrorState message="Access denied: write-offs:read required." /></PageContainer></main>;
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Списания"
          description="Draft, post, and reverse inventory write-offs."
          breadcrumbs={[{ label: 'Store', href: base }, { label: 'Списания' }]}
          actions={
            <Button type="button" variant="secondary" onClick={() => void load()}>
              Refresh
            </Button>
          }
        />

        {loading ? <LoadingState message="Loading write-offs…" /> : null}
        {error ? <ErrorState message={error} /> : null}

        {!loading && !error ? (
          <>
            {auth.hasPermission('write-offs:create') ? (
              <Section>
                <Card title="Создать списание">
                  <div className="stock-filters">
                    <label>
                      <div>Warehouse</div>
                      <Input value={defaultWarehouse ? `${defaultWarehouse.name} (${defaultWarehouse.code})` : 'No warehouse'} readOnly />
                    </label>
                    <label>
                      <div>Reason</div>
                      <select value={reason} onChange={(e) => setReason(e.target.value as WriteOffReason)}>
                        {REASONS.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label style={{ minWidth: 260 }}>
                      <div>Comment</div>
                      <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Optional comment" />
                    </label>
                    <Button type="button" onClick={() => void createDraft()} disabled={!defaultWarehouse || creating}>
                      {creating ? 'Creating…' : 'Create draft'}
                    </Button>
                  </div>
                </Card>
              </Section>
            ) : null}

            <Section>
              <Card title={`Документы (${docs.length})`}>
                {docs.length === 0 ? (
                  <EmptyState message="No write-offs yet." />
                ) : (
                  <ul className="stock-list">
                    {docs.map((doc) => (
                      <li key={doc.id} className="stock-row">
                        <div>
                          <strong>
                            <Link href={`${base}/write-offs/${doc.id}`}>{doc.number}</Link>
                          </strong>
                          <div className="meta-row">
                            <StatusBadge status={doc.status} />
                            <span>{doc.reason}</span>
                            <span>Items {doc.items.length}</span>
                            <span>Warehouse {doc.warehouseId}</span>
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
