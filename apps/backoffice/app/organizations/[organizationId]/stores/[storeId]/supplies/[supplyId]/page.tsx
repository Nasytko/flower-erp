'use client';

import Link from 'next/link';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { type AuditLogEntry } from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { EntityAuditHistory } from '@/components/audit/entity-audit-history';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';
import { Field } from '@/components/layout/field';
import { FancySelect } from '@/components/layout/fancy-select';
import { ConfirmDialog } from '@/components/workspace/workspace-ui';
import { useToast } from '@/components/ui/toast';
import { newIdempotencyKey } from '@/lib/idempotency';
import { formatApiErrorMessage } from '@/lib/format-api-error';

type PendingConfirm =
  | { kind: 'receive' }
  | { kind: 'annul' }
  | { kind: 'remove'; line: SupplyLine }
  | { kind: 'saveEdit'; line: SupplyLine }
  | null;

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

function todayDateInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dateInputFromIso(iso: string | null | undefined): string {
  if (!iso) return todayDateInput();
  return iso.slice(0, 10);
}

function receiptAtFromDateInput(date: string): string {
  return new Date(`${date}T12:00:00`).toISOString();
}

function formatDateLabel(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('ru-RU');
  } catch {
    return iso.slice(0, 10);
  }
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
    receivedDate?: string | null;
    paymentDueDate?: string | null;
    supplierDocumentNumber?: string | null;
    comment?: string | null;
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
  const [confirm, setConfirm] = useState<PendingConfirm>(null);
  const toast = useToast();
  const [receivedDate, setReceivedDate] = useState(todayDateInput);
  const [paymentDueDate, setPaymentDueDate] = useState('');
  const [supplierDocumentNumber, setSupplierDocumentNumber] = useState('');
  const [headerComment, setHeaderComment] = useState('');
  const [auditTrail, setAuditTrail] = useState<AuditLogEntry[]>([]);

  async function load(selectItemId?: string) {
    setLoading(true);
    setError(null);
    try {
      const client = getApiClient();
      const [s, items, unts, history] = await Promise.all([
        client.getSupply(organizationId, storeId, supplyId),
        client.listItems(organizationId, { pageSize: 100, status: 'ACTIVE' }),
        client.listUnits(organizationId, 1, 100),
        client.listSupplyAuditTrail(organizationId, storeId, supplyId).catch(() => []),
      ]);
      setSupply(s);
      setReceivedDate(dateInputFromIso(s.receivedDate));
      setPaymentDueDate(s.paymentDueDate ? dateInputFromIso(s.paymentDueDate) : '');
      setSupplierDocumentNumber(s.supplierDocumentNumber ?? '');
      setHeaderComment(s.comment ?? '');
      setAuditTrail(history);
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

  async function onSaveEdit(line: SupplyLine, skipConfirm = false) {
    if (!editQty.trim() || Number(editQty) <= 0) {
      setError('Укажите количество больше нуля');
      return;
    }
    if (!editCost.trim() || Number(editCost) < 0) {
      setError('Укажите себестоимость за единицу (BYN)');
      return;
    }
    const posted =
      supply?.status === 'RECEIVED' || supply?.status === 'PARTIALLY_RECEIVED';
    if (posted && !skipConfirm) {
      setConfirm({ kind: 'saveEdit', line });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await getApiClient().updateSupplyItem(organizationId, storeId, supplyId, line.itemId, {
        orderedQuantity: editQty,
        plannedUnitPrice: editCost,
      });
      cancelEdit();
      toast.success('Позиция сохранена');
      await load();
    } catch (err) {
      const message = formatApiErrorMessage(err, 'Не удалось сохранить строку');
      setError(message);
      toast.error(message);
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
      toast.success('Позиция добавлена');
      await load();
      requestAnimationFrame(() => {
        const el = document.getElementById(draftQtyId) as HTMLInputElement | null;
        el?.focus();
      });
    } catch (err) {
      const message = formatApiErrorMessage(err, 'Не удалось добавить позицию');
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  function onRemoveLine(line: SupplyLine) {
    setConfirm({ kind: 'remove', line });
  }

  async function performRemoveLine(line: SupplyLine) {
    setBusy(true);
    setError(null);
    try {
      if (editingItemId === line.itemId) cancelEdit();
      await getApiClient().removeSupplyItem(organizationId, storeId, supplyId, line.itemId);
      toast.success('Позиция убрана');
      await load();
    } catch (err) {
      const message = formatApiErrorMessage(err, 'Не удалось удалить позицию');
      setError(message);
      toast.error(message);
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

  async function onSaveHeader(event: FormEvent) {
    event.preventDefault();
    if (!open) return;
    setBusy(true);
    setError(null);
    try {
      await getApiClient().updateSupply(organizationId, storeId, supplyId, {
        receivedDate,
        paymentDueDate: paymentDueDate.trim() || null,
        supplierDocumentNumber: supplierDocumentNumber.trim() || null,
        comment: headerComment.trim() || null,
      });
      toast.success('Данные документа сохранены');
      await load();
    } catch (err) {
      const message = formatApiErrorMessage(err, 'Не удалось сохранить');
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  function onReceive() {
    setConfirm({ kind: 'receive' });
  }

  async function performReceive() {
    setBusy(true);
    setError(null);
    try {
      const client = getApiClient();
      await client.updateSupply(organizationId, storeId, supplyId, {
        receivedDate,
        paymentDueDate: paymentDueDate.trim() || null,
        supplierDocumentNumber: supplierDocumentNumber.trim() || null,
        comment: headerComment.trim() || null,
      });
      await client.receiveSupply(
        organizationId,
        storeId,
        supplyId,
        { receivedAt: receiptAtFromDateInput(receivedDate) },
        newIdempotencyKey('supply'),
      );
      toast.success('Приёмка проведена на склад');
      await load();
    } catch (err) {
      const message = formatApiErrorMessage(err, 'Не удалось оприходовать');
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  function onAnnul() {
    setConfirm({ kind: 'annul' });
  }

  async function performAnnul() {
    setBusy(true);
    setError(null);
    try {
      await getApiClient().annulSupply(organizationId, storeId, supplyId);
      toast.success('Черновик аннулирован');
      await load();
    } catch (err) {
      const message = formatApiErrorMessage(err, 'Не удалось аннулировать');
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function onConfirmDialog() {
    if (!confirm) return;
    const pending = confirm;
    setConfirm(null);
    if (pending.kind === 'receive') await performReceive();
    if (pending.kind === 'annul') await performAnnul();
    if (pending.kind === 'remove') await performRemoveLine(pending.line);
    if (pending.kind === 'saveEdit') await onSaveEdit(pending.line, true);
  }

  function confirmDialogProps(): {
    title: string;
    message: string;
    destructive?: boolean;
    confirmLabel?: string;
  } | null {
    if (!confirm) return null;
    if (confirm.kind === 'receive') {
      return {
        title: 'Провести на склад',
        message:
          'Оприходовать все позиции на склад? После проведения можно будет исправить количество и себестоимость.',
        confirmLabel: 'Провести',
      };
    }
    if (confirm.kind === 'annul') {
      return {
        title: 'Аннулировать приёмку',
        message: 'Аннулировать приёмку? Это действие нельзя отменить.',
        destructive: true,
        confirmLabel: 'Аннулировать',
      };
    }
    if (confirm.kind === 'remove') {
      return {
        title: 'Убрать позицию',
        message: `Убрать «${confirm.line.item?.name ?? 'позицию'}» из приёмки?`,
        destructive: true,
        confirmLabel: 'Убрать',
      };
    }
    return {
      title: 'Сохранить правку',
      message:
        'Остатки на складе обновятся, а изменение появится в истории «было → стало».',
      confirmLabel: 'Сохранить',
    };
  }

  const dialog = confirmDialogProps();

  const open =
    supply?.status === 'DRAFT' || supply?.status === 'SUBMITTED_TO_SUPPLIER';
  const posted = supply?.status === 'RECEIVED' || supply?.status === 'PARTIALLY_RECEIVED';
  const canEditLines = Boolean(open || posted);
  const draftTotal = lineTotal(qty, unitCost);
  const supplyTotal =
    supply?.items.reduce((sum, line) => {
      const part = lineTotal(line.orderedQuantity, line.plannedUnitPrice);
      return sum + (part ? Number(part) : 0);
    }, 0) ?? 0;
  const canReceive =
    open &&
    supply.items.length > 0 &&
    supply.items.every(
      (line) =>
        line.plannedUnitPrice != null &&
        Number(line.plannedUnitPrice) >= 0 &&
        Number(line.orderedQuantity) > 0,
    );

  return (
    <main>
      <PageContainer>
        <PageHeader
          title={supply?.number ?? 'Приёмка'}
          description={
            open
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
              <Card title="Документ">
                {open ? (
                  <form onSubmit={(event) => void onSaveHeader(event)} className="form-grid">
                    <Field label="Дата прихода">
                      <Input
                        type="date"
                        value={receivedDate}
                        onChange={(e) => setReceivedDate(e.target.value)}
                        aria-label="Дата прихода"
                      />
                    </Field>
                    <Field label="Оплатить до">
                      <Input
                        type="date"
                        value={paymentDueDate}
                        onChange={(e) => setPaymentDueDate(e.target.value)}
                        aria-label="Срок оплаты"
                      />
                    </Field>
                    <Field label="Номер накладной">
                      <Input
                        value={supplierDocumentNumber}
                        onChange={(e) => setSupplierDocumentNumber(e.target.value)}
                        placeholder="Номер документа поставщика"
                        aria-label="Номер накладной"
                      />
                    </Field>
                    <Field label="Комментарий">
                      <Input
                        value={headerComment}
                        onChange={(e) => setHeaderComment(e.target.value)}
                        aria-label="Комментарий"
                      />
                    </Field>
                    <div>
                      <Button type="submit" variant="secondary" disabled={busy}>
                        Сохранить
                      </Button>
                    </div>
                  </form>
                ) : (
                  <dl
                    style={{
                      display: 'grid',
                      gap: 10,
                      fontSize: 'var(--text-sm)',
                      margin: 0,
                    }}
                  >
                    <div>
                      <dt style={{ color: 'var(--color-muted)' }}>Дата прихода</dt>
                      <dd style={{ margin: 0 }}>{formatDateLabel(supply.receivedDate)}</dd>
                    </div>
                    <div>
                      <dt style={{ color: 'var(--color-muted)' }}>Оплатить до</dt>
                      <dd style={{ margin: 0 }}>{formatDateLabel(supply.paymentDueDate)}</dd>
                    </div>
                    <div>
                      <dt style={{ color: 'var(--color-muted)' }}>Номер накладной</dt>
                      <dd style={{ margin: 0 }}>{supply.supplierDocumentNumber?.trim() || '—'}</dd>
                    </div>
                    {supply.comment ? (
                      <div>
                        <dt style={{ color: 'var(--color-muted)' }}>Комментарий</dt>
                        <dd style={{ margin: 0 }}>{supply.comment}</dd>
                      </div>
                    ) : null}
                  </dl>
                )}
              </Card>
            </Section>

            <Section>
              <Card title="Позиции">
                {supply.items.length > 0 ? (
                  <p className="supply-lines__sum" style={{ margin: '0 0 12px', fontSize: 'var(--text-sm)' }}>
                    Итого: {supplyTotal.toFixed(2)} BYN
                    {open ? (
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
                              {open ? (
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

                  {open ? (
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

                {open ? (
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

                {open && showQuickCreate ? (
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
                {open ? (
                  <Button
                    type="button"
                    disabled={busy || !canReceive || editingItemId != null}
                    onClick={() => void onReceive()}
                  >
                    Провести на склад
                  </Button>
                ) : null}
                {open ? (
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
              {open && supply.items.length > 0 && !canReceive ? (
                <p style={{ marginTop: 12, fontSize: 'var(--text-sm)', color: 'var(--color-muted)' }}>
                  Чтобы провести, у каждой позиции должны быть количество и себестоимость.
                </p>
              ) : null}
            </Section>

            <Section>
              <EntityAuditHistory entries={auditTrail} />
            </Section>
          </>
        ) : null}
      </PageContainer>
      {dialog ? (
        <ConfirmDialog
          open={confirm != null}
          title={dialog.title}
          message={dialog.message}
          confirmLabel={dialog.confirmLabel}
          destructive={dialog.destructive}
          busy={busy}
          onConfirm={() => void onConfirmDialog()}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
    </main>
  );
}
