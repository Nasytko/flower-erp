'use client';

import { Suspense, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { ApiClientError } from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { AutoNumberNote, Field } from '@/components/layout/field';
import { MoneyBynInput, parseBynToApi } from '@/components/layout/money-byn-input';
import {
  PaymentSplitEditor,
  createEmptyPaymentLine,
  parsePaymentSplit,
  type PaymentSplitLine,
} from '@/components/layout/payment-split-editor';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { ErrorState, LoadingState } from '@/components/layout/states';

type CatalogItem = {
  id: string;
  name: string;
  code: string;
  itemType: string;
  isSellable?: boolean;
};

type PaymentMethod = { id: string; name: string; code: string };

type CompositionLine = { key: string; itemId: string; quantity: string };

const DISCOUNT_REASONS = [
  { value: 'PROMOTION', label: 'Акция' },
  { value: 'LOYAL_CUSTOMER', label: 'Постоянный клиент' },
  { value: 'AGED_FLOWERS', label: 'Цветы с уценкой' },
  { value: 'MANAGER_DECISION', label: 'Решение менеджера' },
  { value: 'OTHER', label: 'Другое' },
] as const;

function newKey() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `k_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export default function NewSalePage() {
  return (
    <Suspense
      fallback={
        <main>
          <LoadingState message="Загрузка…" />
        </main>
      }
    >
      <NewSalePageInner />
    </Suspense>
  );
}

function NewSalePageInner() {
  const params = useParams<{ organizationId: string; storeId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const auth = useAuth();
  const { organizationId, storeId } = params;
  const base = `/organizations/${organizationId}/stores/${storeId}`;
  const fromOrderId = searchParams.get('fromOrder');

  const [warehouseId, setWarehouseId] = useState('');
  const [warehouseLabel, setWarehouseLabel] = useState('');
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [bouquetName, setBouquetName] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [composition, setComposition] = useState<CompositionLine[]>([
    { key: newKey(), itemId: '', quantity: '1' },
  ]);
  const [itemQuery, setItemQuery] = useState('');
  const [discountType, setDiscountType] = useState<'NONE' | 'PERCENT' | 'FIXED'>('NONE');
  const [discountValue, setDiscountValue] = useState('');
  const [discountReason, setDiscountReason] = useState<string>('OTHER');
  const [comment, setComment] = useState('');
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [paymentLines, setPaymentLines] = useState<PaymentSplitLine[]>([createEmptyPaymentLine()]);
  const [orderBalanceDue, setOrderBalanceDue] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canPay =
    auth.hasPermission('payments:create') && auth.hasPermission('payments:complete');

  const filteredItems = useMemo(() => {
    const q = itemQuery.trim().toLowerCase();
    const pool = !q
      ? items
      : items.filter(
          (item) =>
            item.name.toLowerCase().includes(q) || item.code.toLowerCase().includes(q),
        );
    // Prefer flowers first for bouquet assembly.
    return [...pool]
      .sort((a, b) => {
        if (a.itemType === b.itemType) return a.name.localeCompare(b.name, 'ru');
        if (a.itemType === 'FLOWER') return -1;
        if (b.itemType === 'FLOWER') return 1;
        return 0;
      })
      .slice(0, 80);
  }, [items, itemQuery]);

  const compositionSummary = useMemo(() => {
    return composition
      .filter((line) => line.itemId && line.quantity.trim())
      .map((line) => {
        const item = items.find((row) => row.id === line.itemId);
        return `${line.quantity.trim()}× ${item?.name ?? 'позиция'}`;
      });
  }, [composition, items]);

  useEffect(() => {
    if (!auth.hasPermission('sales:create')) return;
    let cancelled = false;
    setLoading(true);
    const client = getApiClient();
    Promise.all([
      client.listWarehouses(organizationId, storeId),
      fromOrderId
        ? Promise.resolve({ items: [] as CatalogItem[] })
        : client.listItems(organizationId, { pageSize: 100, status: 'ACTIVE' }),
      fromOrderId ? client.getOrder(organizationId, storeId, fromOrderId) : Promise.resolve(null),
      canPay
        ? client.listPaymentMethods(organizationId, storeId, { activeOnly: true })
        : Promise.resolve([] as PaymentMethod[]),
      fromOrderId && canPay
        ? client.getOrderPaymentSummary(organizationId, storeId, fromOrderId)
        : Promise.resolve(null),
    ])
      .then(([warehouses, catalog, order, methods, orderPay]) => {
        if (cancelled) return;
        const defaultWh = warehouses.find((w) => w.isDefault) ?? warehouses[0];
        if (defaultWh) {
          setWarehouseId(defaultWh.id);
          setWarehouseLabel(`${defaultWh.name} (${defaultWh.code})`);
        }
        const catalogItems = catalog.items as CatalogItem[];
        setItems(catalogItems);
        const firstFlower =
          catalogItems.find((item) => item.itemType === 'FLOWER') ?? catalogItems[0];
        if (firstFlower) {
          setComposition([{ key: newKey(), itemId: firstFlower.id, quantity: '1' }]);
        }
        if (order) {
          setUnitPrice(order.plannedPrice ?? '');
          setBouquetName(`Заказ ${order.number}`);
          setComment(order.comment ?? '');
        }
        setPaymentMethods(methods);
        if (methods[0]) {
          setPaymentLines([createEmptyPaymentLine(methods[0].id)]);
        }
        setOrderBalanceDue(orderPay?.balanceDue ?? null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiClientError ? err.message : 'Не удалось загрузить');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, storeId, auth, fromOrderId, canPay]);

  function discountPayload() {
    if (discountType === 'NONE' || !auth.hasPermission('sales:discount')) return undefined;
    if (discountType === 'PERCENT') {
      const value = discountValue.trim();
      if (!value) return undefined;
      return { type: discountType, value, reason: discountReason };
    }
    const amount = parseBynToApi(discountValue);
    if (!amount) return undefined;
    return { type: discountType, value: amount, reason: discountReason };
  }

  function buildDirectLines() {
    const price = parseBynToApi(unitPrice);
    const lines = composition.filter((line) => line.itemId && line.quantity.trim());
    if (lines.length === 0) {
      throw new ApiClientError({
        message: 'Добавьте хотя бы один цветок или материал в состав букета',
        code: 'VALIDATION',
        status: 400,
        requestId: 'local',
      });
    }
    if (!price) {
      throw new ApiClientError({
        message: 'Укажите цену букета в BYN (например 45.50)',
        code: 'VALIDATION',
        status: 400,
        requestId: 'local',
      });
    }
    if (!bouquetName.trim()) {
      throw new ApiClientError({
                        message: 'Укажите название букета',
        code: 'VALIDATION',
        status: 400,
        requestId: 'local',
      });
    }
    const firstQty = Number(lines[0]!.quantity);
    const firstUnit =
      firstQty > 0 ? (Number(price) / firstQty).toFixed(2) : Number(price).toFixed(2);
    return lines.map((line, index) => ({
      itemId: line.itemId,
      quantity: line.quantity.trim(),
      unitPrice: index === 0 ? firstUnit : '0.00',
      description: index === 0 ? bouquetName.trim() : undefined,
    }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (!fromOrderId && !warehouseId) {
        throw new ApiClientError({
          message: 'Не найден склад магазина. Обратитесь к директору.',
          code: 'VALIDATION',
          status: 400,
          requestId: 'local',
        });
      }

      const payments = canPay ? parsePaymentSplit(paymentLines) : [];
      const balanceLeft = orderBalanceDue != null ? Number(orderBalanceDue) : null;
      const needsPaymentNow =
        canPay &&
        (!fromOrderId || balanceLeft == null || Number.isNaN(balanceLeft) || balanceLeft > 0.0001);
      if (needsPaymentNow && payments.length === 0) {
        throw new ApiClientError({
          message: fromOrderId
            ? 'Укажите доплату (способ и сумму) или несколько способов. Если всё уже оплачено предоплатой — обновите страницу.'
            : 'Укажите способ оплаты и сумму. Можно добавить несколько способов.',
          code: 'VALIDATION',
          status: 400,
          requestId: 'local',
        });
      }

      const client = getApiClient();
      let saleId: string;
      if (fromOrderId) {
        const created = await client.createSaleFromOrder(organizationId, storeId, fromOrderId, {
          unitPrice: parseBynToApi(unitPrice) ?? undefined,
          comment: comment.trim() || undefined,
          discount: discountPayload(),
        });
        saleId = created.id;
      } else {
        const created = await client.createDirectSale(organizationId, storeId, {
          warehouseId,
          comment: comment.trim() || undefined,
          lines: buildDirectLines(),
          discount: discountPayload(),
        });
        saleId = created.id;
      }

      if (auth.hasPermission('sales:complete')) {
        await client.completeSale(organizationId, storeId, saleId, newKey());
        if (fromOrderId && auth.hasPermission('payments:complete')) {
          try {
            await client.allocateOrderPrepaymentsToSale(
              organizationId,
              storeId,
              fromOrderId,
              { saleId },
              newKey(),
            );
          } catch {
            // Prepayment allocation is best-effort; sale already completed.
          }
        }
        for (const payment of payments) {
          const created = await client.createSalePayment(organizationId, storeId, saleId, payment);
          if (created.status === 'DRAFT') {
            await client.completePayment(organizationId, storeId, created.id, newKey());
          }
        }
        router.push(`${base}/sales/${saleId}?completed=1`);
        return;
      }
      router.push(`${base}/sales/${saleId}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось создать');
      setBusy(false);
    }
  }

  if (!auth.hasPermission('sales:create')) {
    return <p className="page-state">Доступ запрещён</p>;
  }

  const canComplete = auth.hasPermission('sales:complete');
  const pricePreview = parseBynToApi(unitPrice);
  const expectedPay =
    fromOrderId && orderBalanceDue != null ? orderBalanceDue : pricePreview;
  const paymentRequired =
    canPay &&
    canComplete &&
    (!fromOrderId ||
      orderBalanceDue == null ||
      Number.isNaN(Number(orderBalanceDue)) ||
      Number(orderBalanceDue) > 0.0001);

  return (
    <main>
      <PageContainer>
        <PageHeader
          title={fromOrderId ? 'Продажа из заказа' : 'Новая продажа'}
          description={
            fromOrderId
              ? 'Заказ готов — оформляем продажу: оплата и списание со склада. Номер назначит система.'
              : 'Продажа в магазине без предварительного заказа. Номер назначит система.'
          }
          breadcrumbs={[
            { label: 'Магазин', href: base },
            { label: 'Продажи', href: `${base}/sales` },
            { label: fromOrderId ? 'Из заказа' : 'Новая' },
          ]}
        />

        {loading ? <LoadingState message="Загрузка каталога и склада магазина…" /> : null}
        {error ? <ErrorState message={error} /> : null}

        {!loading ? (
          <Section>
            <Card title={fromOrderId ? 'Из заказа' : 'Букет для продажи'}>
              {!fromOrderId ? (
                <div className="concept-callout">
                  <strong>Продажа</strong>
                  <p>
                    Клиент забирает букет сейчас. Укажите состав, цену и способ оплаты (можно
                    несколько). Склад спишется сразу
                    {warehouseLabel ? (
                      <>
                        {' '}
                        (<strong>{warehouseLabel}</strong>)
                      </>
                    ) : null}
                    .
                  </p>
                </div>
              ) : (
                <div className="concept-callout">
                  <strong>Заказ → продажа</strong>
                  <p>
                    Когда заказ готов и передаётся клиенту, оформляется продажа. Укажите оплату
                    (можно добрать остаток другим способом) — состав заказа спишется со склада.
                  </p>
                </div>
              )}

              <form onSubmit={onSubmit} className="stack-form">
                <AutoNumberNote label="Номер продажи" />

                <Field
                  label={fromOrderId ? 'Название' : 'Название букета'}
                  tooltip="Так продажа сохранится в истории магазина"
                  required
                >
                  <Input
                    value={bouquetName}
                    onChange={(e) => setBouquetName(e.target.value)}
                    required
                    placeholder="Сборный букет «Розы и эустома»"
                  />
                </Field>

                <Field
                  label="Цена продажи"
                  tooltip="Белорусские рубли и копейки. Можно ввести 45.50 или 45,50"
                  required={!fromOrderId}
                >
                  <MoneyBynInput
                    value={unitPrice}
                    onChange={setUnitPrice}
                    required={!fromOrderId}
                  />
                </Field>

                {!fromOrderId ? (
                  <div className="stack-form bouquet-composition">
                    <Field
                      label="Состав букета"
                      tooltip="Эти позиции спишутся со склада магазина сразу после продажи"
                      required
                    >
                      <Input
                        value={itemQuery}
                        onChange={(e) => setItemQuery(e.target.value)}
                        placeholder="Найти цветок или материал…"
                      />
                    </Field>

                    {composition.map((line, index) => (
                      <div key={line.key} className="bouquet-line">
                        <select
                          className="field-control"
                          value={line.itemId}
                          onChange={(e) =>
                            setComposition((prev) =>
                              prev.map((row) =>
                                row.key === line.key ? { ...row, itemId: e.target.value } : row,
                              ),
                            )
                          }
                          required
                          aria-label={`Позиция ${index + 1}`}
                        >
                          <option value="">Выберите позицию</option>
                          {filteredItems.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.itemType === 'FLOWER' ? 'Цветок · ' : 'Материал · '}
                              {item.name} ({item.code})
                            </option>
                          ))}
                          {line.itemId &&
                          !filteredItems.some((item) => item.id === line.itemId) ? (
                            <option value={line.itemId}>{line.itemId}</option>
                          ) : null}
                        </select>
                        <Input
                          value={line.quantity}
                          onChange={(e) =>
                            setComposition((prev) =>
                              prev.map((row) =>
                                row.key === line.key
                                  ? { ...row, quantity: e.target.value.replace(',', '.') }
                                  : row,
                              ),
                            )
                          }
                          required
                          style={{ width: 110 }}
                          placeholder="Кол-во"
                          aria-label={`Количество ${index + 1}`}
                          inputMode="decimal"
                        />
                        {composition.length > 1 ? (
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() =>
                              setComposition((prev) => prev.filter((row) => row.key !== line.key))
                            }
                          >
                            Удалить
                          </Button>
                        ) : null}
                      </div>
                    ))}

                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        setComposition((prev) => [
                          ...prev,
                          {
                            key: newKey(),
                            itemId: filteredItems[0]?.id ?? '',
                            quantity: '1',
                          },
                        ])
                      }
                    >
                      + Добавить позицию
                    </Button>

                    {compositionSummary.length > 0 ? (
                      <p className="bouquet-summary">
                        К списанию: {compositionSummary.join(', ')}
                        {pricePreview ? (
                          <>
                            {' '}
                            · К оплате: <strong>{pricePreview} BYN</strong>
                          </>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {auth.hasPermission('sales:discount') ? (
                  <div className="stack-form">
                    <Field
                      label="Скидка"
                      tooltip="Необязательно. Укажите только если есть основание для снижения цены"
                    >
                      <select
                        className="field-control"
                        value={discountType}
                        onChange={(e) =>
                          setDiscountType(e.target.value as 'NONE' | 'PERCENT' | 'FIXED')
                        }
                      >
                        <option value="NONE">Без скидки</option>
                        <option value="PERCENT">Процент</option>
                        <option value="FIXED">Фиксированная сумма</option>
                      </select>
                    </Field>
                    {discountType !== 'NONE' ? (
                      <>
                        {discountType === 'PERCENT' ? (
                          <Field label="Процент скидки" required>
                            <Input
                              value={discountValue}
                              onChange={(e) => setDiscountValue(e.target.value)}
                              required
                              placeholder="10"
                              inputMode="decimal"
                            />
                          </Field>
                        ) : (
                          <Field label="Сумма скидки" required>
                            <MoneyBynInput
                              value={discountValue}
                              onChange={setDiscountValue}
                              required
                            />
                          </Field>
                        )}
                        <Field label="Причина скидки" required>
                          <select
                            className="field-control"
                            value={discountReason}
                            onChange={(e) => setDiscountReason(e.target.value)}
                          >
                            {DISCOUNT_REASONS.map((reason) => (
                              <option key={reason.value} value={reason.value}>
                                {reason.label}
                              </option>
                            ))}
                          </select>
                        </Field>
                      </>
                    ) : null}
                  </div>
                ) : null}

                <Field
                  label="Комментарий"
                  tooltip="Внутренняя заметка для сотрудников — покупатель её не видит"
                >
                  <Input
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Например: без упаковки, оплата картой"
                  />
                </Field>

                {canPay && canComplete ? (
                  <PaymentSplitEditor
                    methods={paymentMethods}
                    lines={paymentLines}
                    onChange={setPaymentLines}
                    expectedAmount={expectedPay}
                    required={paymentRequired}
                    disabled={busy}
                    label={fromOrderId ? 'Доплата при выдаче' : 'Оплата'}
                  />
                ) : null}

                <Button
                  type="submit"
                  disabled={
                    busy ||
                    (!fromOrderId && !warehouseId) ||
                    (paymentRequired && paymentMethods.length === 0)
                  }
                >
                  {busy
                    ? 'Оформляем…'
                    : canComplete
                      ? 'Оформить продажу'
                      : 'Создать черновик продажи'}
                </Button>
                {canComplete ? (
                  <p className="field__hint">
                    Продажа завершится, состав спишется со склада
                    {canPay ? ', оплата зафиксируется по указанным способам' : ''}.
                  </p>
                ) : null}
              </form>
            </Card>
          </Section>
        ) : null}
      </PageContainer>
    </main>
  );
}
