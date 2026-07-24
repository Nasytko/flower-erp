'use client';

import Link from 'next/link';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
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
  const { organizationId, storeId, supplyId } = params;
  const base = `/organizations/${organizationId}/stores/${storeId}`;
  const draftQtyId = useId();
  const draftCostId = useId();

  const [supply, setSupply] = useState<{
    id: string;
    number: string;
    status: string;
    warehouseId: string;
    supplier?: { name: string; code: string };
    items: SupplyLine[];
  } | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [units, setUnits] = useState<Ref[]>([]);
  const [itemId, setItemId] = useState('');
  const [qty, setQty] = useState('1');
  const [unitCost, setUnitCost] = useState('');
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickType, setQuickType] = useState<'FLOWER' | 'MATERIAL'>('FLOWER');
  const [quickUnitId, setQuickUnitId] = useState('');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState('');
  const [editCost, setEditCost] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [corrections, setCorrections] = useState<
    Array<{
      id: string;
      createdAt: string;
      beforeState: {
        itemName?: string;
        itemCode?: string;
        quantity?: string;
        unitCost?: string | null;
        total?: string | null;
      } | null;
      afterState: {
        itemName?: string;
        itemCode?: string;
        quantity?: string;
        unitCost?: string | null;
        total?: string | null;
      } | null;
    }>
  >([]);

  async function load(selectItemId?: string) {
    setLoading(true);
    setError(null);
    try {
      const client = getApiClient();
      const [s, items, unts, history] = await Promise.all([
        client.getSupply(organizationId, storeId, supplyId),
        client.listItems(organizationId, { pageSize: 100, status: 'ACTIVE' }),
        client.listUnits(organizationId, 1, 100),
        client.listSupplyCorrections(organizationId, storeId, supplyId).catch(() => []),
      ]);
      setSupply(s);
      setCorrections(history);
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

  function startEdit(line: SupplyLine) {
    setEditingItemId(line.itemId);
    setEditQty(line.orderedQuantity);
    setEditCost(line.plannedUnitPrice ?? '');
    setError(null);
  }

  function cancelEdit() {
    setEditingItemId(null);
    setEditQty('');
    setEditCost('');
  }

  async function onSaveEdit(line: SupplyLine) {
    setBusy(true);
    setError(null);
    try {
      if (!editQty.trim() || Number(editQty) <= 0) {
        setError('Укажите количество больше нуля');
        setBusy(false);
        return;
      }
      if (!editCost.trim() || Number(editCost) < 0) {
        setError('Укажите себестоимость за единицу (BYN)');
        setBusy(false);
        return;
      }
      if (
        supply?.status === 'RECEIVED' ||
        supply?.status === 'PARTIALLY_RECEIVED'
      ) {
        const ok = window.confirm(
          'Сохранить правку? Остатки на складе обновятся, а изменение появится в истории «было → стало».',
        );
        if (!ok) {
          setBusy(false);
          return;
        }
      }
      await getApiClient().updateSupplyItem(organizationId, storeId, supplyId, line.itemId, {
        orderedQuantity: editQty,
        plannedUnitPrice: editCost,
      });
      cancelEdit();
      await load();
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось сохранить строку'));
    } finally {
      setBusy(false);
    }
  }

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
    if (!window.confirm(`Убрать «${line.item?.name ?? 'позицию'}» из приёмки?`)) return;
    setBusy(true);
    setError(null);
    try {
      if (editingItemId === line.itemId) cancelEdit();
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

  async function onReceive() {
    if (
      !window.confirm(
        'Оприходовать все позиции на склад? После проведения можно будет исправить количество и себестоимость.',
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await getApiClient().receiveSupply(
        organizationId,
        storeId,
        supplyId,
        { receivedAt: new Date().toISOString() },
        crypto.randomUUID(),
      );
      await load();
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось оприходовать'));
    } finally {
      setBusy(false);
    }
  }

  async function onAnnul() {
    if (!window.confirm('Аннулировать черновик приёмки?')) return;
    setBusy(true);
    setError(null);
    try {
      await getApiClient().annulSupply(organizationId, storeId, supplyId);
      await load();
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось аннулировать'));
    } finally {
      setBusy(false);
    }
  }

  const draft = supply?.status === 'DRAFT';
  const posted = supply?.status === 'RECEIVED' || supply?.status === 'PARTIALLY_RECEIVED';
  const canEditLines = Boolean(draft || posted);
  const draftTotal = lineTotal(qty, unitCost);
  const supplyTotal =
    supply?.items.reduce((sum, line) => {
      const part = lineTotal(line.orderedQuantity, line.plannedUnitPrice);
      return sum + (part ? Number(part) : 0);
    }, 0) ?? 0;
  const canReceive =
    draft &&
    supply.items.length > 0 &&
    supply.items.every(
      (line) =>
        line.plannedUnitPrice != null &&
        Number(line.plannedUnitPrice) >= 0 &&
        Number(line.orderedQuantity) > 0,
    );

  function formatWhen(iso: string): string {
    try {
      return new Date(iso).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  }

  function formatCorrectionSide(
    state: {
      itemName?: string;
      quantity?: string;
      unitCost?: string | null;
      total?: string | null;
    } | null,
  ): string {
    if (!state) return '—';
    const qty = state.quantity ?? '—';
    const cost = state.unitCost != null && state.unitCost !== '' ? `${state.unitCost} BYN` : '—';
    const total = state.total != null && state.total !== '' ? `${state.total} BYN` : null;
    return `${qty} × ${cost}${total ? ` = ${total}` : ''}`;
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title={supply?.number ?? 'Приёмка'}
          description={
            draft
              ? 'Добавьте товары, укажите количество и себестоимость. Когда всё верно — проведите на склад.'
              : posted
                ? 'Документ проведён. Можно исправить количество или себестоимость — изменения появятся в истории ниже.'
                : supply?.status === 'SUBMITTED_TO_SUPPLIER'
                  ? 'Документ отправлен — ожидает оприходования на склад.'
                  : 'Документ приёмки.'
          }
          breadcrumbs={[
            { label: 'Организации', href: '/organizations' },
            { label: 'Магазин', href: base },
            { label: 'Приёмки', href: `${base}/supplies` },
            { label: supply?.number ?? 'Приёмка' },
          ]}
          actions={supply ? <StatusBadge status={supply.status} /> : undefined}
        />
        {loading ? <LoadingState /> : null}
        {error ? <ErrorState message={error} /> : null}
        {supply ? (
          <>
            {supply.supplier?.name ? (
              <p style={{ margin: '0 0 12px', color: 'var(--color-muted)', fontSize: 'var(--text-sm)' }}>
                Поставщик: <strong style={{ color: 'var(--color-foreground)' }}>{supply.supplier.name}</strong>
              </p>
            ) : null}

            <Section>
              <Card title="Позиции">
                {supply.items.length > 0 ? (
                  <p className="supply-lines__sum" style={{ margin: '0 0 12px', fontSize: 'var(--text-sm)' }}>
                    Итого: {supplyTotal.toFixed(2)} BYN
                    {draft ? (
                      <span style={{ fontWeight: 400, color: 'var(--color-muted)' }}>
                        {' '}
                        · можно править до проведения
                      </span>
                    ) : posted ? (
                      <span style={{ fontWeight: 400, color: 'var(--color-muted)' }}>
                        {' '}
                        · можно исправить количество и себестоимость
                      </span>
                    ) : null}
                  </p>
                ) : (
                  <p className="supply-lines__empty" style={{ marginBottom: 12 }}>
                    Пока пусто. Добавьте первую позицию ниже.
                  </p>
                )}

                <div className="supply-lines">
                  <div className="supply-lines__head" aria-hidden="true">
                    <span>Товар</span>
                    <span>Кол-во</span>
                    <span>Себес</span>
                    <span>Сумма</span>
                    <span />
                  </div>

                  {supply.items.map((line) => {
                    const isEditing = canEditLines && editingItemId === line.itemId;
                    const total = lineTotal(
                      isEditing ? editQty : line.orderedQuantity,
                      isEditing ? editCost : line.plannedUnitPrice,
                    );
                    return (
                      <div
                        key={line.id}
                        className={`supply-lines__row${isEditing ? ' supply-lines__row--draft' : ''}`}
                      >
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
                          {isEditing ? (
                            <Input
                              className="supply-lines__input"
                              value={editQty}
                              onChange={(e) => setEditQty(e.target.value)}
                              inputMode="decimal"
                              aria-label="Количество"
                            />
                          ) : (
                            <div className="supply-lines__value">{line.orderedQuantity}</div>
                          )}
                        </div>
                        <div className="supply-lines__cell">
                          <span className="supply-lines__label">Себес / ед.</span>
                          {isEditing ? (
                            <Input
                              className="supply-lines__input"
                              value={editCost}
                              onChange={(e) => setEditCost(e.target.value)}
                              inputMode="decimal"
                              aria-label="Себестоимость"
                            />
                          ) : (
                            <div className="supply-lines__value">
                              {formatMoney(line.plannedUnitPrice)}
                            </div>
                          )}
                        </div>
                        <div className="supply-lines__cell">
                          <span className="supply-lines__label">Сумма</span>
                          <div className="supply-lines__value supply-lines__sum">
                            {formatMoney(total)}
                          </div>
                        </div>
                        <div className="supply-lines__actions">
                          {canEditLines && !isEditing ? (
                            <>
                              <Button
                                type="button"
                                variant="secondary"
                                disabled={busy || editingItemId != null}
                                onClick={() => startEdit(line)}
                              >
                                Изменить
                              </Button>
                              {draft ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  disabled={busy || editingItemId != null}
                                  onClick={() => void onRemoveLine(line)}
                                >
                                  Убрать
                                </Button>
                              ) : null}
                            </>
                          ) : null}
                          {isEditing ? (
                            <>
                              <Button
                                type="button"
                                disabled={busy}
                                onClick={() => void onSaveEdit(line)}
                              >
                                Сохранить
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                disabled={busy}
                                onClick={cancelEdit}
                              >
                                Отмена
                              </Button>
                            </>
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
                        <Button type="submit" disabled={busy || !itemId || editingItemId != null}>
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
                    disabled={busy || !canReceive || editingItemId != null}
                    onClick={() => void onReceive()}
                  >
                    Провести на склад
                  </Button>
                ) : null}
                {draft ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void onAnnul()}
                  >
                    Аннулировать
                  </Button>
                ) : null}
                <Link href={`${base}/warehouses/${supply.warehouseId}/inventory`}>
                  <Button type="button" variant="secondary">
                    Остатки склада
                  </Button>
                </Link>
                <Link href={`${base}/supplies`}>
                  <Button type="button" variant="ghost">
                    К списку
                  </Button>
                </Link>
              </div>
              {draft && supply.items.length > 0 && !canReceive ? (
                <p style={{ marginTop: 12, fontSize: 'var(--text-sm)', color: 'var(--color-muted)' }}>
                  Чтобы провести, у каждой позиции должны быть количество и себестоимость.
                </p>
              ) : null}
            </Section>

            {posted || corrections.length > 0 ? (
              <Section>
                <Card title="История правок">
                  {corrections.length === 0 ? (
                    <p style={{ margin: 0, color: 'var(--color-muted)', fontSize: 'var(--text-sm)' }}>
                      Пока правок не было. После изменения позиции здесь появится «было → стало».
                    </p>
                  ) : (
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
                      {corrections.map((entry) => {
                        const name =
                          entry.afterState?.itemName ??
                          entry.beforeState?.itemName ??
                          'Позиция';
                        return (
                          <li
                            key={entry.id}
                            style={{
                              padding: '12px 14px',
                              border: '1px solid var(--color-border)',
                              borderRadius: 10,
                              background: 'var(--color-surface)',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: '8px 16px',
                                justifyContent: 'space-between',
                                marginBottom: 8,
                              }}
                            >
                              <strong>{name}</strong>
                              <span style={{ color: 'var(--color-muted)', fontSize: 'var(--text-sm)' }}>
                                {formatWhen(entry.createdAt)}
                              </span>
                            </div>
                            <div
                              style={{
                                display: 'grid',
                                gap: 6,
                                fontSize: 'var(--text-sm)',
                              }}
                            >
                              <div>
                                <span style={{ color: 'var(--color-muted)' }}>Было: </span>
                                {formatCorrectionSide(entry.beforeState)}
                              </div>
                              <div>
                                <span style={{ color: 'var(--color-muted)' }}>Стало: </span>
                                {formatCorrectionSide(entry.afterState)}
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Card>
              </Section>
            ) : null}
          </>
        ) : null}
      </PageContainer>
    </main>
  );
}
