'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { ApiClientError } from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';

export default function GoodsReceiptPage() {
  const params = useParams<{
    organizationId: string;
    storeId: string;
    supplyId: string;
    receiptId: string;
  }>();
  const { organizationId, storeId, supplyId, receiptId } = params;
  const base = `/organizations/${organizationId}/stores/${storeId}`;

  const [supply, setSupply] = useState<{
    items: Array<{ id: string; itemId: string; orderedQuantity: string; item?: { name: string; code: string } }>;
  } | null>(null);
  const [receipt, setReceipt] = useState<{
    id: string;
    number: string;
    status: string;
    items: Array<{
      id: string;
      supplyItemId: string;
      receivedQuantity: string;
      acceptedQuantity: string;
      defectiveQuantity: string;
      actualUnitPrice: string;
    }>;
  } | null>(null);
  const [supplyItemId, setSupplyItemId] = useState('');
  const [received, setReceived] = useState('0');
  const [accepted, setAccepted] = useState('0');
  const [defective, setDefective] = useState('0');
  const [price, setPrice] = useState('0');
  const [defectReason, setDefectReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const client = getApiClient();
      const [s, r] = await Promise.all([
        client.getSupply(organizationId, storeId, supplyId),
        client.getGoodsReceipt(organizationId, storeId, receiptId),
      ]);
      setSupply(s);
      setReceipt(r);
      if (s.items[0]) setSupplyItemId(s.items[0].id);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось загрузить');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, storeId, supplyId, receiptId]);

  function fillFull() {
    const line = supply?.items.find((i) => i.id === supplyItemId);
    if (!line) return;
    setReceived(line.orderedQuantity);
    setAccepted(line.orderedQuantity);
    setDefective('0');
  }

  async function onAddLine(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await getApiClient().addGoodsReceiptItem(organizationId, storeId, receiptId, {
        supplyItemId,
        receivedQuantity: received,
        acceptedQuantity: accepted,
        defectiveQuantity: defective,
        actualUnitPrice: price,
        defectReason: defectReason || undefined,
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось добавить строку');
    } finally {
      setBusy(false);
    }
  }

  async function onPost() {
    if (!window.confirm('Провести приёмку? Будут созданы партии и движения.')) return;
    setBusy(true);
    setError(null);
    try {
      const key = crypto.randomUUID();
      const posted = await getApiClient().postGoodsReceipt(organizationId, storeId, receiptId, key);
      setReceipt(posted as typeof receipt);
      setSummary(`Проведено: ${posted.status}. Партии и остатки обновлены.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось провести');
    } finally {
      setBusy(false);
    }
  }

  const draft = receipt?.status === 'DRAFT';

  return (
    <main>
      <PageContainer>
        <PageHeader
          title={receipt?.number ?? 'Приёмка'}
          description="Приёмка: получено / принято / брак / цена"
          breadcrumbs={[
            { label: 'Магазин', href: base },
            { label: 'Поставки', href: `${base}/supplies` },
            { label: 'Поставка', href: `${base}/supplies/${supplyId}` },
            { label: receipt?.number ?? 'Receipt' },
          ]}
          actions={receipt ? <StatusBadge status={receipt.status} /> : undefined}
        />
        {loading ? <LoadingState /> : null}
        {error ? <ErrorState message={error} /> : null}
        {summary ? (
          <Section>
            <Card title="Результат">{summary}</Card>
          </Section>
        ) : null}
        {receipt ? (
          <>
            <Section>
              <Card title="Строки приёмки">
                <ul className="list-stack">
                  {receipt.items.map((line) => (
                    <li key={line.id}>
                      <div className="meta-row">
                        <span>recv {line.receivedQuantity}</span>
                        <span>ok {line.acceptedQuantity}</span>
                        <span>def {line.defectiveQuantity}</span>
                        <span>price {line.actualUnitPrice}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            </Section>
            {draft ? (
              <Section>
                <Card title="Добавить строку">
                  <form onSubmit={onAddLine} className="form-grid">
                    <select
                      value={supplyItemId}
                      onChange={(e) => setSupplyItemId(e.target.value)}
                      aria-label="Позиция поставки"
                      style={{ minHeight: 40, borderRadius: 6, border: '1px solid var(--color-border)', padding: 8 }}
                    >
                      {supply?.items.map((line) => (
                        <option key={line.id} value={line.id}>
                          {line.item?.name ?? line.itemId} (ordered {line.orderedQuantity})
                        </option>
                      ))}
                    </select>
                    <Input value={received} onChange={(e) => setReceived(e.target.value)} aria-label="Получено сейчас" />
                    <Input value={accepted} onChange={(e) => setAccepted(e.target.value)} aria-label="Принято" />
                    <Input value={defective} onChange={(e) => setDefective(e.target.value)} aria-label="Брак" />
                    <Input value={price} onChange={(e) => setPrice(e.target.value)} aria-label="Фактическая цена за единицу" />
                    <Input
                      value={defectReason}
                      onChange={(e) => setDefectReason(e.target.value)}
                      aria-label="Причина брака"
                      placeholder="Причина брака"
                    />
                    <Button type="button" variant="secondary" onClick={fillFull}>
                      Получить полностью
                    </Button>
                    <Button type="submit" disabled={busy}>
                      Добавить
                    </Button>
                  </form>
                </Card>
              </Section>
            ) : null}
            {draft ? (
              <Section>
                <Button type="button" disabled={busy || !receipt.items.length} onClick={() => void onPost()}>
                  Провести приёмку
                </Button>
              </Section>
            ) : null}
          </>
        ) : null}
      </PageContainer>
    </main>
  );
}
