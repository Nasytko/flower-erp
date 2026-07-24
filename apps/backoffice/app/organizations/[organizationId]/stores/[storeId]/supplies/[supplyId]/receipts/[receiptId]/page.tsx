'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { getApiClient } from '@/lib/api-client';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';
import { Field } from '@/components/layout/field';
import { FancySelect } from '@/components/layout/fancy-select';
import { formatApiErrorMessage } from '@/lib/format-api-error';

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
    items: Array<{
      id: string;
      itemId: string;
      orderedQuantity: string;
      plannedUnitPrice: string | null;
      item?: { name: string; code: string };
    }>;
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
  const [price, setPrice] = useState('');
  const [defectReason, setDefectReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  function applySupplyLine(lineId: string, items: NonNullable<typeof supply>['items']) {
    const line = items.find((i) => i.id === lineId);
    if (!line) return;
    setSupplyItemId(line.id);
    if (line.plannedUnitPrice != null && line.plannedUnitPrice !== '') {
      setPrice(line.plannedUnitPrice);
    }
  }

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
      const first = s.items[0];
      if (first) {
        applySupplyLine(first.id, s.items);
      }
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось загрузить'));
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
    if (line.plannedUnitPrice != null) {
      setPrice(line.plannedUnitPrice);
    }
  }

  async function onAddLine(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (!price.trim() || Number(price) < 0) {
        setError('Укажите фактическую себестоимость за единицу (BYN)');
        setBusy(false);
        return;
      }
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
      setError(formatApiErrorMessage(err, 'Не удалось добавить строку'));
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
      setError(formatApiErrorMessage(err, 'Не удалось провести'));
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
          description="Укажите количества и фактическую себестоимость — она попадёт на склад."
          breadcrumbs={[
            { label: 'Магазин', href: base },
            { label: 'Приёмки', href: `${base}/supplies` },
            { label: 'Приёмка', href: `${base}/supplies/${supplyId}` },
            { label: receipt?.number ?? 'Приёмка' },
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
                        <span>Получено: {line.receivedQuantity}</span>
                        <span>Принято: {line.acceptedQuantity}</span>
                        <span>Брак: {line.defectiveQuantity}</span>
                        <span>Себес: {line.actualUnitPrice} BYN</span>
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
                    <Field label="Позиция поставки" required>
                      <FancySelect
                        value={supplyItemId}
                        onChange={(value) => {
                          if (supply) applySupplyLine(value, supply.items);
                          else setSupplyItemId(value);
                        }}
                        options={(supply?.items ?? []).map((line) => ({
                          value: line.id,
                          label: line.item?.name ?? line.itemId,
                          hint: `заказано ${line.orderedQuantity}${
                            line.plannedUnitPrice != null
                              ? ` · план ${line.plannedUnitPrice} BYN`
                              : ''
                          }`,
                        }))}
                        required
                        aria-label="Позиция поставки"
                      />
                    </Field>
                    <Field label="Получено">
                      <Input
                        value={received}
                        onChange={(e) => setReceived(e.target.value)}
                        aria-label="Получено сейчас"
                      />
                    </Field>
                    <Field label="Принято">
                      <Input
                        value={accepted}
                        onChange={(e) => setAccepted(e.target.value)}
                        aria-label="Принято"
                      />
                    </Field>
                    <Field label="Брак">
                      <Input
                        value={defective}
                        onChange={(e) => setDefective(e.target.value)}
                        aria-label="Брак"
                      />
                    </Field>
                    <Field
                      label="Себестоимость за ед., BYN"
                      required
                      hint="Подставляется из поставки, можно поправить"
                    >
                      <Input
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        inputMode="decimal"
                        aria-label="Фактическая себестоимость за единицу"
                        required
                      />
                    </Field>
                    <Field label="Причина брака" hint="Если есть брак">
                      <Input
                        value={defectReason}
                        onChange={(e) => setDefectReason(e.target.value)}
                        aria-label="Причина брака"
                      />
                    </Field>
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
                <Button
                  type="button"
                  disabled={busy || !receipt.items.length}
                  onClick={() => void onPost()}
                >
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
