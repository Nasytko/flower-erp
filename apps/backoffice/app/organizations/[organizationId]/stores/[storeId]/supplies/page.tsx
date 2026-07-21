'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { ApiClientError } from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';

export default function SuppliesPage() {
  const params = useParams<{ organizationId: string; storeId: string }>();
  const router = useRouter();
  const { organizationId, storeId } = params;
  const base = `/organizations/${organizationId}/stores/${storeId}`;

  const [items, setItems] = useState<
    Array<{ id: string; number: string; status: string; supplierId: string; warehouseId: string }>
  >([]);
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const client = getApiClient();
      const [list, supplierList, warehouses] = await Promise.all([
        client.listSupplies(organizationId, storeId),
        client.listSuppliers(organizationId, { pageSize: 100, status: 'ACTIVE' }),
        client.listWarehouses(organizationId, storeId),
      ]);
      setItems(list);
      setSuppliers(supplierList.items);
      const wh = warehouses.find((w) => w.isDefault) ?? warehouses[0];
      if (wh) setWarehouseId(wh.id);
      if (supplierList.items[0]) setSupplierId(supplierList.items[0].id);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, storeId]);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const created = await getApiClient().createSupply(organizationId, storeId, {
        warehouseId,
        supplierId,
      });
      router.push(`${base}/supplies/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Create failed');
      setCreating(false);
    }
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Поставки"
          description="Supply drafts → отправка поставщику → приёмка. Без прямого изменения остатков."
          breadcrumbs={[
            { label: 'Organizations', href: '/organizations' },
            { label: 'Organization', href: `/organizations/${organizationId}` },
            { label: 'Store', href: base },
            { label: 'Поставки' },
          ]}
        />
        <Section>
          <Card title="Список">
            {loading ? <LoadingState /> : null}
            {error ? <ErrorState message={error} /> : null}
            {!loading && items.length === 0 ? <EmptyState message="Поставок пока нет." /> : null}
            <ul className="list-stack">
              {items.map((item) => (
                <li key={item.id}>
                  <Link href={`${base}/supplies/${item.id}`}>
                    <div className="meta-row">
                      <strong>{item.number}</strong>
                      <StatusBadge status={item.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </Section>
        <Section>
          <Card title="Создать поставку">
            <form onSubmit={onCreate} className="form-grid">
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                required
                aria-label="Supplier"
                style={{ minHeight: 40, borderRadius: 6, border: '1px solid var(--color-border)', padding: 8 }}
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
              <Input value={warehouseId} readOnly aria-label="Warehouse id" />
              <Button type="submit" disabled={creating || !supplierId || !warehouseId}>
                {creating ? 'Создание…' : 'Создать DRAFT'}
              </Button>
            </form>
          </Card>
        </Section>
      </PageContainer>
    </main>
  );
}
