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
import { ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';

export default function SupplyDetailPage() {
  const params = useParams<{ organizationId: string; storeId: string; supplyId: string }>();
  const router = useRouter();
  const { organizationId, storeId, supplyId } = params;
  const base = `/organizations/${organizationId}/stores/${storeId}`;

  const [supply, setSupply] = useState<{
    id: string;
    number: string;
    status: string;
    warehouseId: string;
    items: Array<{ id: string; itemId: string; orderedQuantity: string; item?: { name: string; code: string } }>;
  } | null>(null);
  const [receipts, setReceipts] = useState<Array<{ id: string; number: string; status: string }>>([]);
  const [catalog, setCatalog] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [itemId, setItemId] = useState('');
  const [qty, setQty] = useState('1');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const client = getApiClient();
      const [s, r, items] = await Promise.all([
        client.getSupply(organizationId, storeId, supplyId),
        client.listGoodsReceipts(organizationId, storeId, supplyId),
        client.listItems(organizationId, { pageSize: 100, status: 'ACTIVE' }),
      ]);
      setSupply(s);
      setReceipts(r);
      setCatalog(items.items);
      if (items.items[0]) setItemId(items.items[0].id);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, storeId, supplyId]);

  async function onAddItem(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await getApiClient().addSupplyItem(organizationId, storeId, supplyId, {
        itemId,
        orderedQuantity: qty,
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Add item failed');
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit() {
    setBusy(true);
    setError(null);
    try {
      await getApiClient().submitSupply(organizationId, storeId, supplyId);
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Submit failed');
    } finally {
      setBusy(false);
    }
  }

  async function onCreateReceipt() {
    setBusy(true);
    setError(null);
    try {
      const receipt = await getApiClient().createGoodsReceipt(organizationId, storeId, supplyId, {
        receivedAt: new Date().toISOString(),
      });
      router.push(`${base}/supplies/${supplyId}/receipts/${receipt.id}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Create receipt failed');
      setBusy(false);
    }
  }

  const draft = supply?.status === 'DRAFT';
  const receivable =
    supply?.status === 'SUBMITTED_TO_SUPPLIER' || supply?.status === 'PARTIALLY_RECEIVED';

  return (
    <main>
      <PageContainer>
        <PageHeader
          title={supply?.number ?? 'Поставка'}
          description="Карточка Supply"
          breadcrumbs={[
            { label: 'Organizations', href: '/organizations' },
            { label: 'Store', href: base },
            { label: 'Поставки', href: `${base}/supplies` },
            { label: supply?.number ?? 'Supply' },
          ]}
          actions={supply ? <StatusBadge status={supply.status} /> : undefined}
        />
        {loading ? <LoadingState /> : null}
        {error ? <ErrorState message={error} /> : null}
        {supply ? (
          <>
            <Section>
              <Card title="Позиции">
                <ul className="list-stack">
                  {supply.items.map((line) => (
                    <li key={line.id}>
                      <div className="meta-row">
                        <strong>
                          {line.item?.name ?? line.itemId} ({line.item?.code})
                        </strong>
                        <span>ordered: {line.orderedQuantity}</span>
                      </div>
                    </li>
                  ))}
                </ul>
                {draft ? (
                  <form onSubmit={onAddItem} className="form-grid" style={{ marginTop: 16 }}>
                    <select
                      value={itemId}
                      onChange={(e) => setItemId(e.target.value)}
                      aria-label="Item"
                      style={{ minHeight: 40, borderRadius: 6, border: '1px solid var(--color-border)', padding: 8 }}
                    >
                      {catalog.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.code})
                        </option>
                      ))}
                    </select>
                    <Input
                      value={qty}
                      onChange={(e) => setQty(e.target.value)}
                      aria-label="Ordered quantity"
                      required
                    />
                    <Button type="submit" disabled={busy}>
                      Добавить позицию
                    </Button>
                  </form>
                ) : null}
              </Card>
            </Section>
            <Section>
              <div className="page-header__actions">
                {draft ? (
                  <Button type="button" disabled={busy || supply.items.length === 0} onClick={() => void onSubmit()}>
                    Отправить поставщику
                  </Button>
                ) : null}
                {receivable ? (
                  <Button type="button" disabled={busy} onClick={() => void onCreateReceipt()}>
                    Создать приёмку
                  </Button>
                ) : null}
                <Link href={`${base}/warehouses/${supply.warehouseId}/inventory`}>
                  <Button type="button" variant="secondary">
                    Остатки склада
                  </Button>
                </Link>
              </div>
            </Section>
            <Section>
              <Card title="Приёмки">
                <ul className="list-stack">
                  {receipts.map((r) => (
                    <li key={r.id}>
                      <Link href={`${base}/supplies/${supplyId}/receipts/${r.id}`}>
                        <div className="meta-row">
                          <strong>{r.number}</strong>
                          <StatusBadge status={r.status} />
                        </div>
                      </Link>
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
