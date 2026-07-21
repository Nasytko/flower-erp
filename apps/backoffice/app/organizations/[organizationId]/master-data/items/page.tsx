'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { ApiClientError } from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';

type Item = {
  id: string;
  name: string;
  code: string;
  itemType: string;
  status: string;
  categoryId: string;
  unitId: string;
  inventoryPolicyId: string;
};

type Ref = { id: string; name: string; status?: string; itemType?: string };

export default function ItemsPage() {
  const params = useParams<{ organizationId: string }>();
  const organizationId = params.organizationId;
  const base = `/organizations/${organizationId}/master-data`;

  const [items, setItems] = useState<Item[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [nameFilter, setNameFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('ACTIVE');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [categories, setCategories] = useState<Ref[]>([]);
  const [units, setUnits] = useState<Ref[]>([]);
  const [policies, setPolicies] = useState<Ref[]>([]);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [itemType, setItemType] = useState<'FLOWER' | 'MATERIAL'>('FLOWER');
  const [categoryId, setCategoryId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [inventoryPolicyId, setInventoryPolicyId] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = getApiClient();
      const [list, cats, unts, pols] = await Promise.all([
        client.listItems(organizationId, {
          page,
          pageSize: 10,
          name: nameFilter || undefined,
          itemType: typeFilter || undefined,
          status: statusFilter || undefined,
          sortBy: 'name',
          sortDir: 'asc',
        }),
        client.listCategories(organizationId, 1, 100),
        client.listUnits(organizationId, 1, 100),
        client.listPolicies(organizationId, 1, 100),
      ]);
      setItems(list.items);
      setTotalPages(list.totalPages);
      setCategories(cats.items);
      setUnits(unts.items);
      setPolicies(pols.items.filter((p) => p.status === 'ACTIVE'));
      setCategoryId((current) => current || cats.items[0]?.id || '');
      setUnitId((current) => current || unts.items[0]?.id || '');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [organizationId, page, nameFilter, typeFilter, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const match = policies.find((p) => p.itemType === itemType && p.status !== 'ARCHIVED');
    if (match) setInventoryPolicyId(match.id);
  }, [itemType, policies]);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await getApiClient().createItem(organizationId, {
        name,
        code,
        itemType,
        categoryId,
        unitId,
        inventoryPolicyId,
      });
      setName('');
      setCode('');
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Create failed');
    } finally {
      setCreating(false);
    }
  }

  async function onArchive(itemId: string) {
    setError(null);
    try {
      await getApiClient().archiveItem(organizationId, itemId);
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Archive failed');
    }
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Товары"
          description="Единый Item. FLOWER и MATERIAL различаются ItemType и InventoryPolicy."
          breadcrumbs={[
            { label: 'Organizations', href: '/organizations' },
            { label: 'Organization', href: `/organizations/${organizationId}` },
            { label: 'Справочники', href: base },
            { label: 'Товары' },
          ]}
        />

        <Section>
          <Card title="Фильтры">
            <form
              className="form-grid"
              style={{ maxWidth: '100%', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}
              onSubmit={(e) => {
                e.preventDefault();
                setPage(1);
                void load();
              }}
            >
              <Input
                placeholder="Название"
                value={nameFilter}
                onChange={(e) => setNameFilter(e.target.value)}
                aria-label="Filter by name"
              />
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                aria-label="Filter by type"
                style={{ minHeight: 40, borderRadius: 6, border: '1px solid var(--color-border)', padding: 8 }}
              >
                <option value="">Все типы</option>
                <option value="FLOWER">FLOWER</option>
                <option value="MATERIAL">MATERIAL</option>
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Filter by status"
                style={{ minHeight: 40, borderRadius: 6, border: '1px solid var(--color-border)', padding: 8 }}
              >
                <option value="">Все статусы</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="ARCHIVED">ARCHIVED</option>
              </select>
              <Button type="submit" variant="secondary">
                Применить
              </Button>
            </form>
          </Card>
        </Section>

        <Section>
          <Card title="Список">
            {loading ? <LoadingState /> : null}
            {error ? <ErrorState message={error} /> : null}
            {!loading && !error && items.length === 0 ? (
              <EmptyState message="Товаров пока нет. Создайте категорию, единицу и политику, затем товар." />
            ) : null}
            <ul className="list-stack">
              {items.map((item) => (
                <li key={item.id}>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 12,
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: 12,
                      border: '1px solid var(--color-border)',
                      borderRadius: 10,
                      background: 'var(--color-surface)',
                    }}
                  >
                    <div>
                      <Link href={`${base}/items/${item.id}`}>
                        <strong>
                          {item.name} ({item.code})
                        </strong>
                      </Link>
                      <div className="meta-row" style={{ marginTop: 4 }}>
                        <StatusBadge status={item.itemType} />
                        <StatusBadge status={item.status} />
                      </div>
                    </div>
                    {item.status !== 'ARCHIVED' ? (
                      <Button variant="ghost" onClick={() => void onArchive(item.id)}>
                        Архив
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
            <div className="meta-row" style={{ marginTop: 12 }}>
              <Button
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Назад
              </Button>
              <span>
                Стр. {page} / {totalPages}
              </span>
              <Button
                variant="secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Вперёд
              </Button>
            </div>
          </Card>
        </Section>

        <Section>
          <Card title="Создать товар">
            <form onSubmit={onCreate} className="form-grid">
              <Input
                placeholder="Название"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
                aria-label="Item name"
              />
              <Input
                placeholder="Код"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                minLength={2}
                aria-label="Item code"
              />
              <select
                value={itemType}
                onChange={(e) => setItemType(e.target.value as 'FLOWER' | 'MATERIAL')}
                aria-label="Item type"
                style={{ minHeight: 40, borderRadius: 6, border: '1px solid var(--color-border)', padding: 8 }}
              >
                <option value="FLOWER">FLOWER</option>
                <option value="MATERIAL">MATERIAL</option>
              </select>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                required
                aria-label="Category"
                style={{ minHeight: 40, borderRadius: 6, border: '1px solid var(--color-border)', padding: 8 }}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
                required
                aria-label="Unit"
                style={{ minHeight: 40, borderRadius: 6, border: '1px solid var(--color-border)', padding: 8 }}
              >
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
              <select
                value={inventoryPolicyId}
                onChange={(e) => setInventoryPolicyId(e.target.value)}
                required
                aria-label="Inventory policy"
                style={{ minHeight: 40, borderRadius: 6, border: '1px solid var(--color-border)', padding: 8 }}
              >
                {policies
                  .filter((p) => p.itemType === itemType)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
              <Button type="submit" disabled={creating || !categoryId || !unitId || !inventoryPolicyId}>
                {creating ? 'Создание…' : 'Создать'}
              </Button>
            </form>
          </Card>
        </Section>
      </PageContainer>
    </main>
  );
}
