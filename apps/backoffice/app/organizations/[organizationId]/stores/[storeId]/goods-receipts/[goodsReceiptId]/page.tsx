'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { ApiClientError } from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';

type Receipt = {
  id: string;
  number: string;
  status: string;
  supplyId: string;
  items: Array<{
    id: string;
    supplyItemId: string;
    itemId: string;
    receivedQuantity: string;
    acceptedQuantity: string;
    defectiveQuantity: string;
    actualUnitPrice: string;
  }>;
};

type SupplyLine = {
  id: string;
  itemId: string;
  orderedQuantity: string;
  item?: { name: string; code: string };
};

export default function GoodsReceiptPage() {
  const params = useParams<{ organizationId: string; storeId: string; goodsReceiptId: string }>();
  const { organizationId, storeId, goodsReceiptId } = params;
  const base = `/organizations/${organizationId}/stores/${storeId}`;

  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [supplyLines, setSupplyLines] = useState<SupplyLine[]>([]);
  const [supplyItemId, setSupplyItemId] = useState('');
  const [receivedQuantity, setReceivedQuantity] = useState('10');
  const [acceptedQuantity, setAcceptedQuantity] = useState('10');
  const [defectiveQuantity, setDefectiveQuantity] = useState('0');
  const [actualUnitPrice, setActualUnitPrice] = useState('100');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const client = getApiClient();
      const receiptData = await client.getGoodsReceipt(organizationId, storeId, goodsReceiptId);
      const supply = await client.getSupply(organizationId, storeId, receiptData.supplyId);
      setReceipt(receiptData);
      setSupplyLines(supply.items);
      if (supply.items[0] && !supplyItemId) setSupplyItemId(supply.items[0].id);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось загрузить');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, storeId, goodsReceiptId]);

  async function onAddLine(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await getApiClient().addGoodsReceiptItem(organizationId, storeId, goodsReceiptId, {
        supplyItemId,
        receivedQuantity,
        acceptedQuantity,
        defectiveQuantity,
        actualUnitPrice,
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось добавить строку');
    } finally {
      setBusy(false);
    }
  }

  async function onPost() {
    setBusy(true);
    setError(null);
    try {
      await getApiClient().postGoodsReceipt(
        organizationId,
        storeId,
        goodsReceiptId,
        crypto.randomUUID(),
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось провести');
    } finally {
      setBusy(false);
    }
  }

  async function onReverse() {
    setBusy(true);
    setError(null);
    try {
      await getApiClient().reverseGoodsReceipt(
        organizationId,
        storeId,
        goodsReceiptId,
        crypto.randomUUID(),
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Reverse failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title={receipt ? receipt.number : 'Goods Receipt'}
          description="Приёмка и проведение в остатки."
          breadcrumbs={[
            { label: 'Магазин', href: base },
            { label: 'Поставки', href: `${base}/supplies` },
            { label: receipt?.number ?? 'Receipt' },
          ]}
          actions={receipt ? <StatusBadge status={receipt.status} /> : undefined}
        />
        {loading ? <LoadingState /> : null}
        {error ? <ErrorState message={error} /> : null}
        {!loading && receipt ? (
          <>
            <Section>
              <Card title="Строки приёмки">
                {receipt.items.length === 0 ? <EmptyState message="Строк пока нет." /> : null}
                <ul className="list-stack">
                  {receipt.items.map((line) => (
                    <li key={line.id}>
                      <div className="meta-row">
                        <span>Recv {line.receivedQuantity}</span>
                        <span>Acc {line.acceptedQuantity}</span>
                        <span>Def {line.defectiveQuantity}</span>
                        <span>@ {line.actualUnitPrice}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            </Section>
            {receipt.status === 'DRAFT' ? (
              <Section>
                <Card title="Добавить строку">
                  <form onSubmit={onAddLine} className="form-grid">
                    <label>
                      Supply item
                      <select
                        value={supplyItemId}
                        onChange={(e) => setSupplyItemId(e.target.value)}
                        required
                      >
                        {supplyLines.map((line) => (
                          <option key={line.id} value={line.id}>
                            {line.item
                              ? `${line.item.name} (${line.orderedQuantity})`
                              : line.id}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Input
                      value={receivedQuantity}
                      onChange={(e) => setReceivedQuantity(e.target.value)}
                      placeholder="Получено"
                      required
                    />
                    <Input
                      value={acceptedQuantity}
                      onChange={(e) => setAcceptedQuantity(e.target.value)}
                      placeholder="Принято"
                      required
                    />
                    <Input
                      value={defectiveQuantity}
                      onChange={(e) => setDefectiveQuantity(e.target.value)}
                      placeholder="Брак"
                      required
                    />
                    <Input
                      value={actualUnitPrice}
                      onChange={(e) => setActualUnitPrice(e.target.value)}
                      placeholder="Цена за единицу"
                      required
                    />
                    <Button type="submit" disabled={busy}>
                      Добавить
                    </Button>
                  </form>
                  <div style={{ marginTop: 12 }}>
                    <Button onClick={() => void onPost()} disabled={busy || !receipt.items.length}>
                      Провести (POST)
                    </Button>
                  </div>
                </Card>
              </Section>
            ) : null}
            {receipt.status === 'POSTED' ? (
              <Section>
                <Card title="Сторно">
                  <Button variant="ghost" onClick={() => void onReverse()} disabled={busy}>
                    Reverse receipt
                  </Button>
                </Card>
              </Section>
            ) : null}
          </>
        ) : null}
      </PageContainer>
    </main>
  );
}
