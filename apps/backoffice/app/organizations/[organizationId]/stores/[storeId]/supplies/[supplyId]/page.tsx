'use client';

import Link from 'next/link';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { getApiClient } from '@/lib/api-client';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';
import { AutoNumberNote, Field } from '@/components/layout/field';
import { FancySelect } from '@/components/layout/fancy-select';
import { formatApiErrorMessage } from '@/lib/format-api-error';

type CatalogItem = {
  id: string;
  name: string;
  code: string;
  isPurchasable?: boolean;
};

type Ref = { id: string; name: string; status?: string };

type SupplyLine = {
  id: string;
  itemId: string;
  orderedQuantity: string;
  plannedUnitPrice: string | null;
  item?: { name: string; code: string };
};

function lineTotal(qty: string, price: string | null | undefined): string | null {
  const q = Number(qty);
  const p = Number(price);
  if (!Number.isFinite(q) || !Number.isFinite(p) || q < 0 || p < 0) return null;
  return (q * p).toFixed(2);
}

function formatMoney(value: string | null | undefined): string {
  if (value == null || value === '') return '—';
  return `${value} BYN`;
}

export default function SupplyDetailPage() {
  const params = useParams<{ organizationId: string; storeId: string; supplyId: string }>();
  const router = useRouter();
  const { organizationId, storeId, supplyId } = params;
  const base = `/organizations/${organizationId}/stores/${storeId}`;
  const draftQtyId = useId();
  const draftCostId = useId();

  const [supply, setSupply] = useState<{
    id: string;
    number: string;
    status: string;
    warehouseId: string;
    items: SupplyLine[];
  } | null>(null);
  const [receipts, setReceipts] = useState<Array<{ id: string; number: string; status: string }>>(
    [],
  );
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [units, setUnits] = useState<Ref[]>([]);
  const [itemId, setItemId] = useState('');
  const [qty, setQty] = useState('1');
  const [unitCost, setUnitCost] = useState('');
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickType, setQuickType] = useState<'FLOWER' | 'MATERIAL'>('FLOWER');
  const [quickUnitId, setQuickUnitId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(selectItemId?: string) {
    setLoading(true);
    setError(null);
    try {
      const client = getApiClient();
      const [s, r, items, unts] = await Promise.all([
        client.getSupply(organizationId, storeId, supplyId),
        client.listGoodsReceipts(organizationId, storeId, supplyId),
        client.listItems(organizationId, { pageSize: 100, status: 'ACTIVE' }),
        client.listUnits(organizationId, 1, 100),
      ]);
      setSupply(s);
      setReceipts(r);
      const purchasable = items.items.filter((item) => item.isPurchasable !== false);
      setCatalog(purchasable);
      setItemId((current) => {
        if (selectItemId && purchasable.some((item) => item.id === selectItemId)) {
          return selectItemId;
        }
        if (current && purchasable.some((item) => item.id === current)) {
          return current;
        }
        return purchasable[0]?.id ?? '';
      });
      const activeUnits = unts.items.filter((u) => u.status === 'ACTIVE');
      setUnits(activeUnits);
      setQuickUnitId((current) => current || activeUnits[0]?.id || '');
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось загрузить'));
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
      const cost = unitCost.trim();
      if (!itemId) {
        setError('Выберите товар');
        setBusy(false);
        return;
      }
      if (!qty.trim() || Number(qty) <= 0) {
        setError('Укажите количество больше нуля');
        setBusy(false);
        return;
      }
      if (!cost || Number(cost) < 0) {
        setError('Укажите себестоимость за единицу (BYN)');
        setBusy(false);
        return;
      }
      await getApiClient().addSupplyItem(organizationId, storeId, supplyId, {
        itemId,
        orderedQuantity: qty,
        plannedUnitPrice: cost,
      });
      setQty('1');
      setUnitCost('');
      await load();
      requestAnimationFrame(() => {
        const el = document.getElementById(draftQtyId) as HTMLInputElement | null;
        el?.focus();
      });
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось добавить позицию'));
    } finally {
      setBusy(false);
    }
  }

  async function onRemoveLine(line: SupplyLine) {
    if (!window.confirm(`Убрать «${line.item?.name ?? 'позицию'}» из поставки?`)) return;
    setBusy(true);
    setError(null);
    try {
      await getApiClient().removeSupplyItem(organizationId, storeId, supplyId, line.itemId);
      await load();
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось удалить позицию'));
    } finally {
      setBusy(false);
    }
  }

  async function onQuickCreate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (!quickUnitId) {
        setError('Нет единиц измерения. Создайте штуку в Справочники → Единицы.');
        setBusy(false);
        return;
      }
      const created = await getApiClient().createItem(organizationId, {
        name: quickName,
        itemType: quickType,
        unitId: quickUnitId,
        isPurchasable: true,
        isSellable: false,
      });
      setQuickName('');
      setShowQuickCreate(false);
      setItemId(created.id);
      await load(created.id);
      requestAnimationFrame(() => {
        const el = document.getElementById(draftQtyId) as HTMLInputElement | null;
        el?.focus();
      });
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось создать товар'));
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
      setError(formatApiErrorMessage(err, 'Не удалось отправить'));
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
      setError(formatApiErrorMessage(err, 'Не удалось создать приёмку'));
      setBusy(false);
    }
  }

  const draft = supply?.status === 'DRAFT';
  const receivable =
    supply?.status === 'SUBMITTED_TO_SUPPLIER' || supply?.status === 'PARTIALLY_RECEIVED';
  const draftTotal = lineTotal(qty, unitCost);
  const supplyTotal =
    supply?.items.reduce((sum, line) => {
      const part = lineTotal(line.orderedQuantity, line.plannedUnitPrice);
      return sum + (part ? Number(part) : 0);
    }, 0) ?? 0;

  return (
    <main>
      <PageContainer>
        <PageHeader
          title={supply?.number ?? 'Поставка'}
          description="Заполняйте строки: товар, количество и себестоимость. На телефоне поля идут столбь."
          breadcrumbs={[
            { label: 'Организации', href: '/organizations' },
            { label: 'Магазин', href: base },
            { label: 'Поставки', href: `${base}/supplies` },
            { label: supply?.number ?? 'Поставка' },
          ]}
          actions={supply ? <StatusBadge status={supply.status} /> : undefined}
        />
        {loading ? <LoadingState /> : null}
        {error ? <ErrorState message={error} /> : null}
        {supply ? (
          <>
            <Section>
              <Card title="Позиции">
                {supply.items.length > 0 ? (
                  <p
                    className="supply-lines__sum"
                    style={{ margin: '0 0 12px', fontSize: 'var(--text-sm)' }}
                  >
                    Итого: {supplyTotal.toFixed(2)} BYN
                  </p>
                ) : null}
                <div className="supply-lines">
                  <div className="supply-lines__head" aria-hidden="true">
                    <span>Товар</span>
                    <span>Кол-во</span>
                    <span>Себес</span>
                    <span>Сумма</span>
                    <span />
                  </div>

                  {supply.items.length === 0 && !draft ? (
                    <p className="supply-lines__empty">Позиций пока нет</p>
                  ) : null}

                  {supply.items.map((line) => {
                    const total = lineTotal(line.orderedQuantity, line.plannedUnitPrice);
                    return (
                      <div key={line.id} className="supply-lines__row">
                        <div className="supply-lines__cell">
                          <span className="supply-lines__label">Товар</span>
                          <div className="supply-lines__value">
                            <strong>{line.item?.name ?? line.itemId}</strong>
                            {line.item?.code ? (
                              <span className="supply-lines__code">{line.item.code}</span>
                            ) : null}
                          </div>
                        </div>
                        <div className="supply-lines__cell">
                          <span className="supply-lines__label">Количество</span>
                          <div className="supply-lines__value">{line.orderedQuantity}</div>
                        </div>
                        <div className="supply-lines__cell">
                          <span className="supply-lines__label">Себес / ед.</span>
                          <div className="supply-lines__value">
                            {formatMoney(line.plannedUnitPrice)}
                          </div>
                        </div>
                        <div className="supply-lines__cell">
                          <span className="supply-lines__label">Сумма</span>
                          <div className="supply-lines__value supply-lines__sum">
                            {formatMoney(total)}
                          </div>
                        </div>
                        <div className="supply-lines__actions">
                          {draft ? (
                            <Button
                              type="button"
                              variant="ghost"
                              disabled={busy}
                              onClick={() => void onRemoveLine(line)}
                            >
                              Убрать
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}

                  {draft ? (
                    <form className="supply-lines__row supply-lines__row--draft" onSubmit={onAddItem}>
                      <div className="supply-lines__cell">
                        <span className="supply-lines__label">Товар *</span>
                        <FancySelect
                          value={itemId}
                          onChange={setItemId}
                          options={catalog.map((item) => ({
                            value: item.id,
                            label: item.name,
                            hint: item.code,
                          }))}
                          required
                          aria-label="Товар"
                        />
                      </div>
                      <div className="supply-lines__cell">
                        <label className="supply-lines__label" htmlFor={draftQtyId}>
                          Кол-во *
                        </label>
                        <Input
                          id={draftQtyId}
                          className="supply-lines__input"
                          value={qty}
                          onChange={(e) => setQty(e.target.value)}
                          inputMode="decimal"
                          required
                          aria-label="Количество"
                        />
                      </div>
                      <div className="supply-lines__cell">
                        <label className="supply-lines__label" htmlFor={draftCostId}>
                          Себес / ед. *
                        </label>
                        <Input
                          id={draftCostId}
                          className="supply-lines__input"
                          value={unitCost}
                          onChange={(e) => setUnitCost(e.target.value)}
                          inputMode="decimal"
                          placeholder="0.00"
                          required
                          aria-label="Себестоимость за единицу"
                        />
                      </div>
                      <div className="supply-lines__cell">
                        <span className="supply-lines__label">Сумма</span>
                        <div className="supply-lines__value supply-lines__sum">
                          {formatMoney(draftTotal)}
                        </div>
                      </div>
                      <div className="supply-lines__actions">
                        <Button type="submit" disabled={busy || !itemId}>
                          {busy ? '…' : 'Добавить'}
                        </Button>
                      </div>
                    </form>
                  ) : null}
                </div>

                {draft ? (
                  <div className="page-header__actions" style={{ marginTop: 16 }}>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => setShowQuickCreate((v) => !v)}
                    >
                      {showQuickCreate ? 'Скрыть новый товар' : 'Новый товар в справочник'}
                    </Button>
                  </div>
                ) : null}

                {draft && showQuickCreate ? (
                  <form
                    onSubmit={onQuickCreate}
                    className="form-grid"
                    style={{
                      marginTop: 16,
                      maxWidth: '100%',
                      padding: 16,
                      border: '1px solid var(--color-border)',
                      borderRadius: 10,
                      background: 'var(--color-surface)',
                    }}
                  >
                    <p
                      style={{
                        margin: 0,
                        gridColumn: '1 / -1',
                        fontSize: 'var(--text-sm)',
                        color: 'var(--color-muted)',
                      }}
                    >
                      Создаст товар и подставит его в новую строку. Затем укажите количество и
                      себестоимость.
                    </p>
                    <AutoNumberNote label="Код товара" />
                    <Field label="Название" required>
                      <Input
                        value={quickName}
                        onChange={(e) => setQuickName(e.target.value)}
                        required
                        minLength={2}
                        aria-label="Название нового товара"
                      />
                    </Field>
                    <Field label="Тип" required>
                      <FancySelect
                        value={quickType}
                        onChange={(value) => setQuickType(value as 'FLOWER' | 'MATERIAL')}
                        searchable={false}
                        options={[
                          { value: 'FLOWER', label: 'Цветок' },
                          { value: 'MATERIAL', label: 'Материал' },
                        ]}
                        aria-label="Тип нового товара"
                      />
                    </Field>
                    <Field label="Единица" required>
                      <FancySelect
                        value={quickUnitId}
                        onChange={setQuickUnitId}
                        options={units.map((u) => ({ value: u.id, label: u.name }))}
                        required
                        aria-label="Единица нового товара"
                      />
                    </Field>
                    <Button type="submit" disabled={busy || !quickName.trim() || !quickUnitId}>
                      Создать и выбрать
                    </Button>
                  </form>
                ) : null}
              </Card>
            </Section>
            <Section>
              <div className="page-header__actions">
                {draft ? (
                  <Button
                    type="button"
                    disabled={busy || supply.items.length === 0}
                    onClick={() => void onSubmit()}
                  >
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
