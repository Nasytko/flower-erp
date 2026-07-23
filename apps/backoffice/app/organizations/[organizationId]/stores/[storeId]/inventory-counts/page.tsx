'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

type Warehouse = { id: string; name: string; code: string; isDefault: boolean };

export default function InventoryCountsPage() {
  const params = useParams<{ organizationId: string; storeId: string }>();
  const auth = useAuth();
  const { organizationId, storeId } = params;
  const base = `/organizations/${organizationId}/stores/${storeId}`;
  const [docs, setDocs] = useState<InventoryCountDto[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
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
        client.listInventoryCounts(organizationId, storeId),
        client.listWarehouses(organizationId, storeId),
      ]);
      setDocs(nextDocs);
      setWarehouses(nextWarehouses);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось загрузить инвентаризации');
    } finally {
      setLoading(false);
    }
  }, [organizationId, storeId]);

  useEffect(() => {
    if (!auth.hasPermission('inventory-counts:read')) return;
    void load();
  }, [auth, load]);

  async function createDraft() {
    if (!defaultWarehouse) return;
    setCreating(true);
    setError(null);
    try {
      const doc = await getApiClient().createInventoryCount(organizationId, storeId, {
        warehouseId: defaultWarehouse.id,
        comment: comment || undefined,
      });
      window.location.href = `${base}/inventory-counts/${doc.id}`;
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось создать инвентаризацию');
    } finally {
      setCreating(false);
    }
  }

  if (!auth.hasPermission('inventory-counts:read')) {
    return <main><PageContainer><ErrorState message="Доступ запрещён: требуется inventory-counts:read." /></PageContainer></main>;
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Инвентаризации"
          description="Снимок, подсчёт и проведение расхождений."
          breadcrumbs={[{ label: 'Магазин', href: base }, { label: 'Инвентаризации' }]}
          actions={<Button type="button" variant="secondary" onClick={() => void load()}>Обновить</Button>}
        />

        {loading ? <LoadingState message="Загрузка инвентаризаций…" /> : null}
        {error ? <ErrorState message={error} /> : null}

        {!loading && !error ? (
          <>
            {auth.hasPermission('inventory-counts:create') ? (
              <Section>
                <Card title="Создать инвентаризацию">
                  <div className="stock-filters">
                    <Input value={defaultWarehouse ? `${defaultWarehouse.name} (${defaultWarehouse.code})` : 'Склад не найден'} readOnly />
                    <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Комментарий (необязательно)" />
                    <Button type="button" onClick={() => void createDraft()} disabled={!defaultWarehouse || creating}>
                      {creating ? 'Создание…' : 'Создать снимок'}
                    </Button>
                  </div>
                </Card>
              </Section>
            ) : null}

            <Section>
              <Card title={`Документы (${docs.length})`}>
                {docs.length === 0 ? (
                  <EmptyState message="Инвентаризаций пока нет." />
                ) : (
                  <ul className="stock-list">
                    {docs.map((doc) => (
                      <li key={doc.id} className="stock-row">
                        <div>
                          <strong><Link href={`${base}/inventory-counts/${doc.id}`}>{doc.number}</Link></strong>
                          <div className="meta-row">
                            <StatusBadge status={doc.status} />
                            <span>Items {doc.items.length}</span>
                            <span>Версия {doc.version}</span>
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
