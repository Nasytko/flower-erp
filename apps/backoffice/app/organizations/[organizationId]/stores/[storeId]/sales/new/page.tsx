'use client';

import { Suspense, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { ApiClientError } from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { AutoNumberNote, Field } from '@/components/layout/field';
import { FancySelect } from '@/components/layout/fancy-select';
import { MoneyBynInput, parseBynToApi } from '@/components/layout/money-byn-input';
import {
  PaymentSplitEditor,
  createEmptyPaymentLine,
  parsePaymentSplit,
  sumPaymentSplit,
  type PaymentSplitLine,
} from '@/components/layout/payment-split-editor';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { ErrorState, LoadingState } from '@/components/layout/states';
import { InlineAlert } from '@/components/workspace/workspace-ui';
import { formatApiError, type FormattedError } from '@/lib/format-api-error';

type CatalogItem = {
  id: string;
  name: string;
  code: string;
  itemType: string;
  isSellable?: boolean;
};

type PaymentMethod = { id: string; name: string; code: string; type?: string };

type CompositionLine = { key: string; itemId: string; quantity: string };

type SalePosition =
  | {
      key: string;
      kind: 'CUSTOM';
      name: string;
      price: string;
      composition: CompositionLine[];
    }
  | {
      key: string;
      kind: 'READY';
      itemId: string;
      quantity: string;
      unitPrice: string;
    };

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

function emptyCustomPosition(): SalePosition {
  return {
    key: newKey(),
    kind: 'CUSTOM',
    name: '',
    price: '',
    composition: [{ key: newKey(), itemId: '', quantity: '1' }],
  };
}

function emptyReadyPosition(): SalePosition {
  return {
    key: newKey(),
    kind: 'READY',
    itemId: '',
    quantity: '1',
    unitPrice: '',
  };
}

function itemTypeLabel(type: string) {
  if (type === 'FLOWER') return 'Цветок';
  if (type === 'MATERIAL') return 'Материал';
  return type;
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
  const [positions, setPositions] = useState<SalePosition[]>([emptyCustomPosition()]);
  const [itemQuery, setItemQuery] = useState('');
  const [discountType, setDiscountType] = useState<'NONE' | 'PERCENT' | 'FIXED'>('NONE');
  const [discountValue, setDiscountValue] = useState('');
  const [discountReason, setDiscountReason] = useState<string>('OTHER');
  const [comment, setComment] = useState('');
  const [orderTitle, setOrderTitle] = useState('');
  const [orderPrice, setOrderPrice] = useState('');
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [paymentLines, setPaymentLines] = useState<PaymentSplitLine[]>([createEmptyPaymentLine()]);
  const [orderBalanceDue, setOrderBalanceDue] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<FormattedError | null>(null);

  const canPay =
    auth.hasPermission('payments:create') && auth.hasPermission('payments:complete');
  const canListPay =
    auth.hasPermission('payments:create') ||
    auth.hasPermission('payments:complete') ||
    auth.hasPermission('payments:read');

  const ingredients = useMemo(
    () => items.filter((item) => item.itemType === 'FLOWER' || item.itemType === 'MATERIAL'),
    [items],
  );
  const readyBouquets = useMemo(
    () => items.filter((item) => item.isSellable),
    [items],
  );

  const filteredIngredients = useMemo(() => {
    const q = itemQuery.trim().toLowerCase();
    const pool = !q
      ? ingredients
      : ingredients.filter(
          (item) =>
            item.name.toLowerCase().includes(q) || item.code.toLowerCase().includes(q),
        );
    return [...pool]
      .sort((a, b) => {
        if (a.itemType === b.itemType) return a.name.localeCompare(b.name, 'ru');
        if (a.itemType === 'FLOWER') return -1;
        if (b.itemType === 'FLOWER') return 1;
        return 0;
      })
      .slice(0, 120);
  }, [ingredients, itemQuery]);

  const ingredientOptions = useMemo(
    () =>
      filteredIngredients.map((item) => ({
        value: item.id,
        label: item.name,
        hint: item.code,
        group: itemTypeLabel(item.itemType),
      })),
    [filteredIngredients],
  );

  const readyOptions = useMemo(
    () =>
      readyBouquets.map((item) => ({
        value: item.id,
        label: item.name,
        hint: item.code,
        group: 'Готовые букеты',
      })),
    [readyBouquets],
  );

  const summaryLines = useMemo(() => {
    if (fromOrderId) {
      return [
        {
          key: 'order',
          title: orderTitle || 'Заказ',
          detail: 'По составу заказа',
          amount: parseBynToApi(orderPrice),
        },
      ];
    }
    return positions.map((pos) => {
      if (pos.kind === 'READY') {
        const item = items.find((row) => row.id === pos.itemId);
        const qty = Number(pos.quantity) || 0;
        const unit = Number(parseBynToApi(pos.unitPrice) ?? 0);
        const amount = qty > 0 && unit >= 0 ? (qty * unit).toFixed(2) : null;
        return {
          key: pos.key,
          title: item?.name ?? 'Готовый букет',
          detail: item ? `${pos.quantity || '0'} шт · ${item.code}` : 'Не выбран',
          amount,
        };
      }
      const parts = pos.composition
        .filter((line) => line.itemId && line.quantity.trim())
        .map((line) => {
          const item = items.find((row) => row.id === line.itemId);
          return `${line.quantity}× ${item?.name ?? '…'}`;
        });
      return {
        key: pos.key,
        title: pos.name.trim() || 'Свой букет',
        detail: parts.length > 0 ? parts.join(', ') : 'Состав не задан',
        amount: parseBynToApi(pos.price),
      };
    });
  }, [fromOrderId, orderTitle, orderPrice, positions, items]);

  const grossAmount = useMemo(() => {
    const sum = summaryLines.reduce((acc, line) => acc + Number(line.amount ?? 0), 0);
    return sum > 0 || summaryLines.some((l) => l.amount) ? sum.toFixed(2) : null;
  }, [summaryLines]);

  const discountAmount = useMemo(() => {
    if (!grossAmount || discountType === 'NONE') return null;
    if (discountType === 'PERCENT') {
      const pct = Number(discountValue.replace(',', '.'));
      if (!Number.isFinite(pct) || pct <= 0) return null;
      return ((Number(grossAmount) * pct) / 100).toFixed(2);
    }
    return parseBynToApi(discountValue);
  }, [grossAmount, discountType, discountValue]);

  const netAmount = useMemo(() => {
    if (!grossAmount) return null;
    const disc = Number(discountAmount ?? 0);
    return Math.max(Number(grossAmount) - disc, 0).toFixed(2);
  }, [grossAmount, discountAmount]);

  const paidNow = sumPaymentSplit(paymentLines);

  useEffect(() => {
    if (!auth.hasPermission('sales:create')) return;
    let cancelled = false;
    setLoading(true);
    const client = getApiClient();

    async function loadPaymentMethods(): Promise<PaymentMethod[]> {
      if (!canListPay) return [];
      let methods = await client.listPaymentMethods(organizationId, storeId, {
        activeOnly: true,
      });
      if (methods.length === 0 && auth.hasPermission('payments:create')) {
        await client.ensureDefaultPaymentMethods(organizationId, storeId);
        methods = await client.listPaymentMethods(organizationId, storeId, {
          activeOnly: true,
        });
      }
      return methods.map((m) => ({
        id: m.id,
        name: m.name,
        code: m.code,
        type: m.type,
      }));
    }

    Promise.all([
      (async () => {
        let warehouses = await client.listWarehouses(organizationId, storeId);
        if (warehouses.length === 0 && auth.hasPermission('stores:create')) {
          warehouses = await client.ensureDefaultWarehouse(organizationId, storeId);
        }
        return warehouses;
      })(),
      fromOrderId
        ? Promise.resolve({ items: [] as CatalogItem[] })
        : client.listItems(organizationId, { pageSize: 200, status: 'ACTIVE' }),
      fromOrderId ? client.getOrder(organizationId, storeId, fromOrderId) : Promise.resolve(null),
      loadPaymentMethods(),
      fromOrderId && canListPay
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
        if (!fromOrderId) {
          setPositions([emptyCustomPosition()]);
        }
        if (order) {
          setOrderPrice(order.plannedPrice ?? '');
          setOrderTitle(`Заказ ${order.number}`);
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
        setError(formatApiError(err, 'Не удалось загрузить данные для продажи'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, storeId, auth, fromOrderId, canListPay]);

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
    if (positions.length === 0) {
      throw new ApiClientError({
        message: 'Добавьте хотя бы одну позицию в продажу',
        code: 'VALIDATION',
        status: 400,
        requestId: 'local',
      });
    }

    const apiLines: Array<{
      itemId: string;
      quantity: string;
      unitPrice: string;
      description?: string;
    }> = [];

    for (const pos of positions) {
      if (pos.kind === 'READY') {
        const price = parseBynToApi(pos.unitPrice);
        if (!pos.itemId) {
          throw new ApiClientError({
            message: 'Выберите готовый букет из справочника',
            code: 'VALIDATION',
            status: 400,
            requestId: 'local',
          });
        }
        if (!price) {
          throw new ApiClientError({
            message: 'Укажите цену готового букета',
            code: 'VALIDATION',
            status: 400,
            requestId: 'local',
          });
        }
        if (!pos.quantity.trim() || Number(pos.quantity) <= 0) {
          throw new ApiClientError({
            message: 'Укажите количество готового букета',
            code: 'VALIDATION',
            status: 400,
            requestId: 'local',
          });
        }
        const item = items.find((row) => row.id === pos.itemId);
        apiLines.push({
          itemId: pos.itemId,
          quantity: pos.quantity.trim(),
          unitPrice: price,
          description: item?.name,
        });
        continue;
      }

      const price = parseBynToApi(pos.price);
      const lines = pos.composition.filter((line) => line.itemId && line.quantity.trim());
      if (lines.length === 0) {
        throw new ApiClientError({
          message: 'В своём букете добавьте хотя бы один цветок или материал',
          code: 'VALIDATION',
          status: 400,
          requestId: 'local',
        });
      }
      if (!price) {
        throw new ApiClientError({
          message: 'Укажите цену своего букета',
          code: 'VALIDATION',
          status: 400,
          requestId: 'local',
        });
      }
      if (!pos.name.trim()) {
        throw new ApiClientError({
          message: 'Укажите название своего букета',
          code: 'VALIDATION',
          status: 400,
          requestId: 'local',
        });
      }
      const firstQty = Number(lines[0]!.quantity);
      const firstUnit =
        firstQty > 0 ? (Number(price) / firstQty).toFixed(2) : Number(price).toFixed(2);
      lines.forEach((line, index) => {
        apiLines.push({
          itemId: line.itemId,
          quantity: line.quantity.trim(),
          unitPrice: index === 0 ? firstUnit : '0.00',
          description: index === 0 ? pos.name.trim() : undefined,
        });
      });
    }

    return apiLines;
  }

  const canComplete = auth.hasPermission('sales:complete');
  const expectedPay =
    fromOrderId && orderBalanceDue != null ? orderBalanceDue : netAmount;
  const paymentRequired =
    canPay &&
    canComplete &&
    (!fromOrderId ||
      orderBalanceDue == null ||
      Number.isNaN(Number(orderBalanceDue)) ||
      Number(orderBalanceDue) > 0.0001);

  function collectBlockers(): string[] {
    const issues: string[] = [];
    if (!fromOrderId && !warehouseId) {
      issues.push(
        'У магазина нет склада. Без склада продажу оформить нельзя — создайте склад при создании магазина или обратитесь к администратору.',
      );
    }
    if (fromOrderId) {
      if (!orderTitle.trim()) issues.push('Укажите название продажи');
      if (!parseBynToApi(orderPrice)) issues.push('Укажите цену продажи');
    } else {
      if (positions.length === 0) issues.push('Добавьте хотя бы одну позицию');
      positions.forEach((pos, index) => {
        const n = index + 1;
        if (pos.kind === 'CUSTOM') {
          if (!pos.name.trim()) issues.push(`Позиция ${n}: укажите название букета`);
          if (!parseBynToApi(pos.price)) issues.push(`Позиция ${n}: укажите цену`);
          const hasParts = pos.composition.some((line) => line.itemId && line.quantity.trim());
          if (!hasParts) issues.push(`Позиция ${n}: выберите состав (цветы/материалы)`);
        } else {
          if (!pos.itemId) issues.push(`Позиция ${n}: выберите готовый букет из справочника`);
          if (!parseBynToApi(pos.unitPrice)) issues.push(`Позиция ${n}: укажите цену`);
          if (!pos.quantity.trim() || Number(pos.quantity) <= 0) {
            issues.push(`Позиция ${n}: укажите количество`);
          }
        }
      });
    }
    if (paymentRequired) {
      if (paymentMethods.length === 0) {
        issues.push('Нет способов оплаты. Откройте настройки оплат или обновите страницу.');
      } else if (parsePaymentSplit(paymentLines).length === 0) {
        issues.push('Укажите способ оплаты и сумму (можно несколько способов).');
      }
    }
    return issues;
  }

  const blockers = useMemo(() => {
    // Recompute when form fields change — mirrors collectBlockers for live warnings.
    const issues: string[] = [];
    if (!fromOrderId && !warehouseId) {
      issues.push('Нет склада магазина — продажу оформить нельзя.');
    }
    if (!fromOrderId) {
      const incomplete = positions.some((pos) => {
        if (pos.kind === 'CUSTOM') {
          return (
            !pos.name.trim() ||
            !parseBynToApi(pos.price) ||
            !pos.composition.some((line) => line.itemId && line.quantity.trim())
          );
        }
        return !pos.itemId || !parseBynToApi(pos.unitPrice) || !(Number(pos.quantity) > 0);
      });
      if (positions.length === 0 || incomplete) {
        issues.push('Заполните все позиции: название/букет, цену и состав или количество.');
      }
    } else if (!orderTitle.trim() || !parseBynToApi(orderPrice)) {
      issues.push('Укажите название и цену продажи из заказа.');
    }
    if (paymentRequired && paymentMethods.length === 0) {
      issues.push('Не загружены способы оплаты.');
    } else if (paymentRequired && parsePaymentSplit(paymentLines).length === 0) {
      issues.push('Укажите оплату перед оформлением.');
    }
    return issues;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    fromOrderId,
    warehouseId,
    positions,
    orderTitle,
    orderPrice,
    paymentRequired,
    paymentMethods,
    paymentLines,
  ]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const blockersNow = collectBlockers();
      if (blockersNow.length > 0) {
        setError({
          title: 'Сначала исправьте форму',
          message: blockersNow[0]!,
          details: blockersNow.slice(1),
        });
        setBusy(false);
        return;
      }

      const payments = canPay ? parsePaymentSplit(paymentLines) : [];
      const client = getApiClient();
      let saleId: string;
      if (fromOrderId) {
        const created = await client.createSaleFromOrder(organizationId, storeId, fromOrderId, {
          unitPrice: parseBynToApi(orderPrice) ?? undefined,
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
            // best-effort
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
      setError(formatApiError(err, 'Не удалось оформить продажу'));
      setBusy(false);
    }
  }

  if (!auth.hasPermission('sales:create')) {
    return <p className="page-state">Доступ запрещён</p>;
  }

  function updatePosition(key: string, patch: Partial<SalePosition>) {
    setPositions((prev) =>
      prev.map((row) => {
        if (row.key !== key) return row;
        return { ...row, ...patch } as SalePosition;
      }),
    );
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title={fromOrderId ? 'Продажа из заказа' : 'Новая продажа'}
          description={
            fromOrderId
              ? 'Заказ готов — оформляем продажу: оплата и списание. Номер назначит система.'
              : 'Добавьте позиции, укажите оплату. Слева — ввод, справа — итог.'
          }
          breadcrumbs={[
            { label: 'Магазин', href: base },
            { label: 'Продажи', href: `${base}/sales` },
            { label: fromOrderId ? 'Из заказа' : 'Новая' },
          ]}
        />

        {loading ? <LoadingState message="Загрузка каталога и склада…" /> : null}
        {error ? (
          <ErrorState title={error.title} message={error.message} details={error.details} />
        ) : null}

        {!loading ? (
          <Section>
            {!warehouseId && !fromOrderId ? (
              <InlineAlert tone="danger" title="Нет склада магазина">
                Без склада нельзя списать остатки и оформить продажу.
                {auth.hasPermission('stores:create')
                  ? ' Обновите страницу — система попробует создать склад автоматически.'
                  : ' Попросите администратора с правом stores:create создать склад для магазина.'}
              </InlineAlert>
            ) : null}
            {blockers.length > 0 ? (
              <InlineAlert tone="warning" title="Чтобы оформить продажу">
                <ul className="form-checklist">
                  {blockers.map((row) => (
                    <li key={row}>{row}</li>
                  ))}
                </ul>
              </InlineAlert>
            ) : (
              <InlineAlert tone="success" title="Форма готова">
                Можно оформлять продажу — итог справа обновится по мере заполнения.
              </InlineAlert>
            )}

            <form onSubmit={onSubmit} className="sale-form" noValidate>
              <div className="sale-form__main">
                <Card title={fromOrderId ? 'Из заказа' : 'Позиции продажи'}>
                  {!fromOrderId ? (
                    <div className="concept-callout">
                      <strong>Позиции</strong>
                      <p>
                        Можно собрать свой букет из цветов/материалов или продать готовый букет из
                        справочника (позиции с признаком «продаётся»). Склад:{' '}
                        <strong>{warehouseLabel || 'не найден'}</strong>.
                      </p>
                    </div>
                  ) : (
                    <div className="concept-callout">
                      <strong>Заказ → продажа</strong>
                      <p>
                        Состав возьмётся из заказа. Укажите цену при необходимости и оплату
                        (остаток после предоплаты).
                      </p>
                    </div>
                  )}

                  <div className="stack-form">
                    <AutoNumberNote label="Номер продажи" />

                    {fromOrderId ? (
                      <>
                        <Field label="Название" required>
                          <Input
                            value={orderTitle}
                            onChange={(e) => setOrderTitle(e.target.value)}
                            required
                          />
                        </Field>
                        <Field label="Цена продажи" required>
                          <MoneyBynInput value={orderPrice} onChange={setOrderPrice} required />
                        </Field>
                      </>
                    ) : (
                      <>
                        {positions.map((pos, posIndex) => (
                          <div key={pos.key} className="sale-position">
                            <div className="sale-position__head">
                              <strong>
                                Позиция {posIndex + 1}:{' '}
                                {pos.kind === 'CUSTOM' ? 'свой букет' : 'готовый букет'}
                              </strong>
                              {positions.length > 1 ? (
                                <Button
                                  type="button"
                                  variant="secondary"
                                  onClick={() =>
                                    setPositions((prev) => prev.filter((row) => row.key !== pos.key))
                                  }
                                >
                                  Удалить
                                </Button>
                              ) : null}
                            </div>

                            {pos.kind === 'CUSTOM' ? (
                              <div className="stack-form">
                                <Field label="Название букета" required>
                                  <Input
                                    value={pos.name}
                                    onChange={(e) =>
                                      updatePosition(pos.key, { name: e.target.value })
                                    }
                                    required
                                    placeholder="Букет «Розы и эустома»"
                                  />
                                </Field>
                                <Field label="Цена букета" required>
                                  <MoneyBynInput
                                    value={pos.price}
                                    onChange={(price) => updatePosition(pos.key, { price })}
                                    required
                                  />
                                </Field>
                                <Field
                                  label="Состав"
                                  tooltip="Цветы и материалы спишутся со склада"
                                  required
                                >
                                  <Input
                                    value={itemQuery}
                                    onChange={(e) => setItemQuery(e.target.value)}
                                    placeholder="Фильтр по названию или коду…"
                                  />
                                </Field>
                                {pos.composition.map((line, lineIndex) => (
                                  <div key={line.key} className="bouquet-line">
                                    <FancySelect
                                      value={line.itemId}
                                      onChange={(itemId) =>
                                        setPositions((prev) =>
                                          prev.map((row) => {
                                            if (row.key !== pos.key || row.kind !== 'CUSTOM') {
                                              return row;
                                            }
                                            return {
                                              ...row,
                                              composition: row.composition.map((c) =>
                                                c.key === line.key ? { ...c, itemId } : c,
                                              ),
                                            };
                                          }),
                                        )
                                      }
                                      options={ingredientOptions}
                                      placeholder="Цветок или материал"
                                      required
                                      searchPlaceholder="Найти позицию…"
                                      aria-label={`Состав ${lineIndex + 1}`}
                                    />
                                    <Input
                                      value={line.quantity}
                                      onChange={(e) =>
                                        setPositions((prev) =>
                                          prev.map((row) => {
                                            if (row.key !== pos.key || row.kind !== 'CUSTOM') {
                                              return row;
                                            }
                                            return {
                                              ...row,
                                              composition: row.composition.map((c) =>
                                                c.key === line.key
                                                  ? {
                                                      ...c,
                                                      quantity: e.target.value.replace(',', '.'),
                                                    }
                                                  : c,
                                              ),
                                            };
                                          }),
                                        )
                                      }
                                      required
                                      style={{ width: 110 }}
                                      placeholder="Кол-во"
                                      inputMode="decimal"
                                      aria-label={`Количество ${lineIndex + 1}`}
                                    />
                                    {pos.composition.length > 1 ? (
                                      <Button
                                        type="button"
                                        variant="secondary"
                                        onClick={() =>
                                          setPositions((prev) =>
                                            prev.map((row) => {
                                              if (row.key !== pos.key || row.kind !== 'CUSTOM') {
                                                return row;
                                              }
                                              return {
                                                ...row,
                                                composition: row.composition.filter(
                                                  (c) => c.key !== line.key,
                                                ),
                                              };
                                            }),
                                          )
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
                                    setPositions((prev) =>
                                      prev.map((row) => {
                                        if (row.key !== pos.key || row.kind !== 'CUSTOM') {
                                          return row;
                                        }
                                        return {
                                          ...row,
                                          composition: [
                                            ...row.composition,
                                            {
                                              key: newKey(),
                                              itemId: filteredIngredients[0]?.id ?? '',
                                              quantity: '1',
                                            },
                                          ],
                                        };
                                      }),
                                    )
                                  }
                                >
                                  + Позиция в состав
                                </Button>
                              </div>
                            ) : (
                              <div className="stack-form">
                                <Field
                                  label="Готовый букет"
                                  tooltip="Из справочника: позиции с признаком «продаётся»"
                                  required
                                >
                                  <FancySelect
                                    value={pos.itemId}
                                    onChange={(itemId) => updatePosition(pos.key, { itemId })}
                                    options={readyOptions}
                                    placeholder={
                                      readyOptions.length
                                        ? 'Выберите букет'
                                        : 'Нет готовых букетов в справочнике'
                                    }
                                    required
                                    disabled={readyOptions.length === 0}
                                    searchPlaceholder="Найти букет…"
                                    emptyText="Отметьте позиции как «продаётся» в справочнике"
                                  />
                                </Field>
                                {readyOptions.length === 0 ? (
                                  <p className="field__hint">
                                    В справочнике пока нет sellable-позиций. Создайте букет в
                                    «Справочники → Номенклатура» и включите «Продаётся».
                                  </p>
                                ) : null}
                                <div className="bouquet-line">
                                  <Field label="Количество" required>
                                    <Input
                                      value={pos.quantity}
                                      onChange={(e) =>
                                        updatePosition(pos.key, {
                                          quantity: e.target.value.replace(',', '.'),
                                        })
                                      }
                                      required
                                      inputMode="decimal"
                                      style={{ width: 120 }}
                                    />
                                  </Field>
                                  <Field label="Цена за штуку" required>
                                    <MoneyBynInput
                                      value={pos.unitPrice}
                                      onChange={(unitPrice) =>
                                        updatePosition(pos.key, { unitPrice })
                                      }
                                      required
                                    />
                                  </Field>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}

                        <div className="sale-position-actions">
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() =>
                              setPositions((prev) => [...prev, emptyCustomPosition()])
                            }
                          >
                            + Свой букет
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() =>
                              setPositions((prev) => [...prev, emptyReadyPosition()])
                            }
                          >
                            + Готовый букет
                          </Button>
                        </div>
                      </>
                    )}

                    {auth.hasPermission('sales:discount') ? (
                      <div className="stack-form">
                        <Field label="Скидка">
                          <FancySelect
                            value={discountType}
                            onChange={(v) =>
                              setDiscountType(v as 'NONE' | 'PERCENT' | 'FIXED')
                            }
                            options={[
                              { value: 'NONE', label: 'Без скидки' },
                              { value: 'PERCENT', label: 'Процент' },
                              { value: 'FIXED', label: 'Фиксированная сумма' },
                            ]}
                            searchable={false}
                          />
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
                              <FancySelect
                                value={discountReason}
                                onChange={setDiscountReason}
                                options={DISCOUNT_REASONS.map((r) => ({
                                  value: r.value,
                                  label: r.label,
                                }))}
                                searchable={false}
                              />
                            </Field>
                          </>
                        ) : null}
                      </div>
                    ) : null}

                    <Field label="Комментарий">
                      <Input
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Внутренняя заметка"
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
                    ) : !canPay ? (
                      <p className="field__hint">
                        Нет прав на оплату — продажа сохранится без фиксации платежа.
                      </p>
                    ) : null}

                    <Button type="submit" disabled={busy || blockers.length > 0}>
                      {busy
                        ? 'Оформляем…'
                        : canComplete
                          ? 'Оформить продажу'
                          : 'Создать черновик продажи'}
                    </Button>
                    {blockers.length > 0 ? (
                      <p className="field__hint">
                        Кнопка станет активной, когда будут заполнены обязательные поля.
                      </p>
                    ) : canComplete ? (
                      <p className="field__hint">
                        Продажа завершится, состав спишется со склада
                        {canPay ? ', оплата зафиксируется' : ''}.
                      </p>
                    ) : null}
                  </div>
                </Card>
              </div>

              <aside className="sale-form__summary" aria-label="Итог продажи">
                <Card title="Итог">
                  <ul className="sale-summary__list">
                    {summaryLines.map((line) => (
                      <li key={line.key}>
                        <div className="sale-summary__row">
                          <div>
                            <strong>{line.title}</strong>
                            <p>{line.detail}</p>
                          </div>
                          <span>{line.amount ? `${line.amount} BYN` : '—'}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="sale-summary__totals">
                    <div className="sale-summary__total-row">
                      <span>Сумма</span>
                      <strong>{grossAmount ? `${grossAmount} BYN` : '—'}</strong>
                    </div>
                    {discountAmount ? (
                      <div className="sale-summary__total-row">
                        <span>Скидка</span>
                        <strong>−{discountAmount} BYN</strong>
                      </div>
                    ) : null}
                    <div className="sale-summary__total-row sale-summary__total-row--net">
                      <span>К оплате</span>
                      <strong>{netAmount ? `${netAmount} BYN` : '—'}</strong>
                    </div>
                    {paidNow ? (
                      <div className="sale-summary__total-row">
                        <span>Оплата сейчас</span>
                        <strong>{paidNow} BYN</strong>
                      </div>
                    ) : null}
                  </div>
                </Card>
              </aside>
            </form>
          </Section>
        ) : null}
      </PageContainer>
    </main>
  );
}
