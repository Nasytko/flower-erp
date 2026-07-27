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
import { storeStockHint } from '@/lib/store-context';

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

type BuilderMode = 'READY' | 'CUSTOM';

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

function emptyCustomPosition(): Extract<SalePosition, { kind: 'CUSTOM' }> {
  return {
    key: newKey(),
    kind: 'CUSTOM',
    name: '',
    price: '',
    composition: [],
  };
}

function itemTypeLabel(type: string) {
  if (type === 'FLOWER') return 'Цветок';
  if (type === 'MATERIAL') return 'Материал';
  return type;
}

function QtyStepper({
  value,
  onDecrease,
  onIncrease,
  disabled,
}: {
  value: number;
  onDecrease: () => void;
  onIncrease: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="sale-qty">
      <button
        type="button"
        className="sale-qty__btn"
        onClick={onDecrease}
        disabled={disabled || value <= 0}
        aria-label="Уменьшить"
      >
        −
      </button>
      <span className="sale-qty__value" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        className="sale-qty__btn"
        onClick={onIncrease}
        disabled={disabled}
        aria-label="Увеличить"
      >
        +
      </button>
    </div>
  );
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

  const [storeName, setStoreName] = useState('');
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [positions, setPositions] = useState<SalePosition[]>([emptyCustomPosition()]);
  const [builderMode, setBuilderMode] = useState<BuilderMode>('CUSTOM');
  const [catalogQuery, setCatalogQuery] = useState('');
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

  const catalogPool = builderMode === 'READY' ? readyBouquets : ingredients;

  const filteredCatalog = useMemo(() => {
    const q = catalogQuery.trim().toLowerCase();
    const pool = !q
      ? catalogPool
      : catalogPool.filter(
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
      .slice(0, 160);
  }, [catalogPool, catalogQuery]);

  const activeCustom = useMemo(
    () => positions.find((p): p is Extract<SalePosition, { kind: 'CUSTOM' }> => p.kind === 'CUSTOM'),
    [positions],
  );

  const readyQtyByItem = useMemo(() => {
    const map = new Map<string, number>();
    for (const pos of positions) {
      if (pos.kind !== 'READY' || !pos.itemId) continue;
      map.set(pos.itemId, (map.get(pos.itemId) ?? 0) + (Number(pos.quantity) || 0));
    }
    return map;
  }, [positions]);

  const customQtyByItem = useMemo(() => {
    const map = new Map<string, number>();
    if (!activeCustom) return map;
    for (const line of activeCustom.composition) {
      if (!line.itemId) continue;
      map.set(line.itemId, (map.get(line.itemId) ?? 0) + (Number(line.quantity) || 0));
    }
    return map;
  }, [activeCustom]);

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
    return positions
      .filter((pos) => {
        if (pos.kind === 'READY') return Boolean(pos.itemId) && Number(pos.quantity) > 0;
        return pos.composition.some((line) => line.itemId && Number(line.quantity) > 0);
      })
      .map((pos) => {
        if (pos.kind === 'READY') {
          const item = items.find((row) => row.id === pos.itemId);
          const qty = Number(pos.quantity) || 0;
          const unit = Number(parseBynToApi(pos.unitPrice) ?? 0);
          const amount = qty > 0 && unit >= 0 ? (qty * unit).toFixed(2) : null;
          return {
            key: pos.key,
            title: item?.name ?? 'Готовый букет',
            detail: item ? `${pos.quantity || '0'} шт · готовый` : 'Не выбран',
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
          title: pos.name.trim() || 'Собранный букет',
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

    void (async () => {
      try {
        const methods = await loadPaymentMethods();
        if (cancelled) return;
        setPaymentMethods(methods);
        if (methods[0]) {
          setPaymentLines([createEmptyPaymentLine(methods[0].id)]);
        }
      } catch (err: unknown) {
        if (cancelled) return;
        setError(formatApiError(err, 'Не удалось загрузить способы оплаты'));
      }
    })();

    Promise.all([
      client.getStore(organizationId, storeId),
      fromOrderId
        ? Promise.resolve({ items: [] as CatalogItem[] })
        : client.listItems(organizationId, { pageSize: 100, status: 'ACTIVE' }),
      fromOrderId ? client.getOrder(organizationId, storeId, fromOrderId) : Promise.resolve(null),
      fromOrderId && canListPay
        ? client.getOrderPaymentSummary(organizationId, storeId, fromOrderId)
        : Promise.resolve(null),
    ])
      .then(([store, catalog, order, orderPay]) => {
        if (cancelled) return;
        setStoreName(store.name);
        const catalogItems = catalog.items as CatalogItem[];
        setItems(catalogItems);
        if (!fromOrderId) {
          setPositions([emptyCustomPosition()]);
          setBuilderMode('CUSTOM');
        }
        if (order) {
          setOrderPrice(order.plannedPrice ?? '');
          setOrderTitle(`Заказ ${order.number}`);
          setComment(order.comment ?? '');
        }
        setOrderBalanceDue(orderPay?.balanceDue ?? null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(formatApiError(err, 'Не удалось загрузить каталог для продажи'));
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

  function bumpReadyQty(itemId: string, delta: number) {
    setPositions((prev) => {
      const existing = prev.find((p) => p.kind === 'READY' && p.itemId === itemId);
      if (existing && existing.kind === 'READY') {
        const nextQty = Math.max(0, (Number(existing.quantity) || 0) + delta);
        if (nextQty <= 0) return prev.filter((p) => p.key !== existing.key);
        return prev.map((p) =>
          p.key === existing.key && p.kind === 'READY'
            ? { ...p, quantity: String(nextQty) }
            : p,
        );
      }
      if (delta <= 0) return prev;
      return [
        ...prev.filter((p) => !(p.kind === 'CUSTOM' && p.composition.length === 0 && !p.name && !p.price)),
        {
          key: newKey(),
          kind: 'READY' as const,
          itemId,
          quantity: '1',
          unitPrice: '',
        },
      ];
    });
  }

  function setReadyUnitPrice(itemId: string, unitPrice: string) {
    setPositions((prev) =>
      prev.map((p) =>
        p.kind === 'READY' && p.itemId === itemId ? { ...p, unitPrice } : p,
      ),
    );
  }

  function ensureCustomPosition(prev: SalePosition[]): {
    list: SalePosition[];
    custom: Extract<SalePosition, { kind: 'CUSTOM' }>;
  } {
    const found = prev.find(
      (p): p is Extract<SalePosition, { kind: 'CUSTOM' }> => p.kind === 'CUSTOM',
    );
    if (found) return { list: prev, custom: found };
    const custom = emptyCustomPosition();
    return { list: [...prev, custom], custom };
  }

  function bumpCustomQty(itemId: string, delta: number) {
    setPositions((prev) => {
      const { list, custom } = ensureCustomPosition(prev);
      const existing = custom.composition.find((line) => line.itemId === itemId);
      let composition = custom.composition;
      if (existing) {
        const nextQty = Math.max(0, (Number(existing.quantity) || 0) + delta);
        composition =
          nextQty <= 0
            ? custom.composition.filter((line) => line.key !== existing.key)
            : custom.composition.map((line) =>
                line.key === existing.key ? { ...line, quantity: String(nextQty) } : line,
              );
      } else if (delta > 0) {
        composition = [
          ...custom.composition,
          { key: newKey(), itemId, quantity: '1' },
        ];
      } else {
        return prev;
      }
      return list.map((p) =>
        p.key === custom.key && p.kind === 'CUSTOM' ? { ...p, composition } : p,
      );
    });
  }

  function updateCustomMeta(patch: { name?: string; price?: string }) {
    setPositions((prev) => {
      const { list, custom } = ensureCustomPosition(prev);
      return list.map((p) =>
        p.key === custom.key && p.kind === 'CUSTOM' ? { ...p, ...patch } : p,
      );
    });
  }

  function removePosition(key: string) {
    setPositions((prev) => {
      const next = prev.filter((p) => p.key !== key);
      if (next.length === 0) return [emptyCustomPosition()];
      return next;
    });
  }

  function switchMode(mode: BuilderMode) {
    setBuilderMode(mode);
    setCatalogQuery('');
    if (mode === 'CUSTOM') {
      setPositions((prev) => {
        if (prev.some((p) => p.kind === 'CUSTOM')) return prev;
        return [...prev, emptyCustomPosition()];
      });
    }
  }

  function buildDirectLines() {
    const meaningful = positions.filter((pos) => {
      if (pos.kind === 'READY') return Boolean(pos.itemId) && Number(pos.quantity) > 0;
      return pos.composition.some((line) => line.itemId && Number(line.quantity) > 0);
    });

    if (meaningful.length === 0) {
      throw new ApiClientError({
        message: 'Добавьте товары: готовый букет или состав',
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

    for (const pos of meaningful) {
      if (pos.kind === 'READY') {
        const price = parseBynToApi(pos.unitPrice);
        if (!price) {
          throw new ApiClientError({
            message: 'Укажите цену для каждого готового букета',
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
      const lines = pos.composition.filter((line) => line.itemId && Number(line.quantity) > 0);
      if (lines.length === 0) {
        throw new ApiClientError({
          message: 'В собранном букете выберите хотя бы один товар',
          code: 'VALIDATION',
          status: 400,
          requestId: 'local',
        });
      }
      if (!price) {
        throw new ApiClientError({
          message: 'Укажите цену собранного букета',
          code: 'VALIDATION',
          status: 400,
          requestId: 'local',
        });
      }
      if (!pos.name.trim()) {
        throw new ApiClientError({
          message: 'Укажите название собранного букета',
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
    if (fromOrderId) {
      if (!orderTitle.trim()) issues.push('Укажите название продажи');
      if (!parseBynToApi(orderPrice)) issues.push('Укажите цену продажи');
    } else {
      const meaningful = positions.filter((pos) => {
        if (pos.kind === 'READY') return Boolean(pos.itemId) && Number(pos.quantity) > 0;
        return pos.composition.some((line) => line.itemId && Number(line.quantity) > 0);
      });
      if (meaningful.length === 0) {
        issues.push('Выберите товары в ячейках (+/−) — готовый букет или сборку');
      }
      meaningful.forEach((pos) => {
        if (pos.kind === 'CUSTOM') {
          if (!pos.name.trim()) issues.push('Укажите название собранного букета');
          if (!parseBynToApi(pos.price)) issues.push('Укажите цену собранного букета');
        } else {
          const item = items.find((row) => row.id === pos.itemId);
          if (!parseBynToApi(pos.unitPrice)) {
            issues.push(`Укажите цену: ${item?.name ?? 'готовый букет'}`);
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

  const blockers = useMemo(() => collectBlockers(), [
    fromOrderId,
    positions,
    orderTitle,
    orderPrice,
    paymentRequired,
    paymentMethods,
    paymentLines,
    items,
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

  const selectedReady = positions.filter(
    (p): p is Extract<SalePosition, { kind: 'READY' }> =>
      p.kind === 'READY' && Boolean(p.itemId) && Number(p.quantity) > 0,
  );
  const customPartsCount = activeCustom?.composition.filter(
    (line) => line.itemId && Number(line.quantity) > 0,
  ).length ?? 0;

  return (
    <main>
      <PageContainer>
        <PageHeader
          title={fromOrderId ? 'Продажа из заказа' : 'Новая продажа'}
          description={
            fromOrderId
              ? 'Заказ готов — оформляем продажу: оплата и списание. Номер назначит система.'
              : 'Выберите тип продажи, наберите товары ячейками, укажите цену и оплату.'
          }
          breadcrumbs={[
            { label: 'Магазин', href: base },
            { label: 'Продажи', href: `${base}/sales` },
            { label: fromOrderId ? 'Из заказа' : 'Новая' },
          ]}
        />

        {loading ? <LoadingState message="Загрузка каталога…" /> : null}
        {error ? (
          <ErrorState title={error.title} message={error.message} details={error.details} />
        ) : null}

        {!loading ? (
          <Section>
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
                Можно оформлять — итог справа обновится по мере заполнения.
              </InlineAlert>
            )}

            <form onSubmit={onSubmit} className="sale-form" noValidate>
              <div className="sale-form__main">
                <Card title={fromOrderId ? 'Из заказа' : 'Состав продажи'}>
                  {fromOrderId ? (
                    <div className="concept-callout">
                      <strong>Заказ → продажа</strong>
                      <p>
                        Состав возьмётся из заказа. Укажите цену при необходимости и оплату
                        (остаток после предоплаты).
                      </p>
                    </div>
                  ) : (
                    <p className="sale-hint">{storeStockHint(storeName)} Нажмите «+» на ячейке, чтобы добавить товар.</p>
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
                        <div className="sale-mode" role="tablist" aria-label="Тип продажи">
                          <button
                            type="button"
                            role="tab"
                            aria-selected={builderMode === 'READY'}
                            className={`sale-mode__card${builderMode === 'READY' ? ' sale-mode__card--active' : ''}`}
                            onClick={() => switchMode('READY')}
                          >
                            <span className="sale-mode__title">Готовый букет</span>
                            <span className="sale-mode__text">
                              Продажа из витрины / справочника (отмечен как «продаётся»)
                            </span>
                            {selectedReady.length > 0 ? (
                              <span className="sale-mode__badge">
                                {selectedReady.reduce((s, p) => s + (Number(p.quantity) || 0), 0)} шт
                              </span>
                            ) : null}
                          </button>
                          <button
                            type="button"
                            role="tab"
                            aria-selected={builderMode === 'CUSTOM'}
                            className={`sale-mode__card${builderMode === 'CUSTOM' ? ' sale-mode__card--active' : ''}`}
                            onClick={() => switchMode('CUSTOM')}
                          >
                            <span className="sale-mode__title">Собрать букет</span>
                            <span className="sale-mode__text">
                              Набрать цветы и материалы по количеству, задать цену букета
                            </span>
                            {customPartsCount > 0 ? (
                              <span className="sale-mode__badge">{customPartsCount} поз.</span>
                            ) : null}
                          </button>
                        </div>

                        {builderMode === 'CUSTOM' ? (
                          <div className="sale-custom-meta">
                            <Field label="Название букета" required>
                              <Input
                                value={activeCustom?.name ?? ''}
                                onChange={(e) => updateCustomMeta({ name: e.target.value })}
                                required
                                placeholder="Например: Букет «Нежность»"
                              />
                            </Field>
                            <Field label="Цена букета" required>
                              <MoneyBynInput
                                value={activeCustom?.price ?? ''}
                                onChange={(price) => updateCustomMeta({ price })}
                                required
                              />
                            </Field>
                          </div>
                        ) : null}

                        <Field
                          label={builderMode === 'READY' ? 'Каталог готовых' : 'Цветы и материалы'}
                        >
                          <Input
                            value={catalogQuery}
                            onChange={(e) => setCatalogQuery(e.target.value)}
                            placeholder="Поиск по названию или коду…"
                            aria-label="Поиск товаров"
                          />
                        </Field>

                        {builderMode === 'READY' && readyBouquets.length === 0 ? (
                          <InlineAlert tone="warning" title="Нет готовых букетов">
                            В справочнике нет позиций с признаком «Продаётся». Создайте букет в
                            «Справочники → Номенклатура» и включите продажу.
                          </InlineAlert>
                        ) : null}

                        {filteredCatalog.length === 0 ? (
                          <p className="sale-cells__empty">
                            {catalogQuery.trim()
                              ? 'Ничего не найдено по запросу'
                              : 'Каталог пуст'}
                          </p>
                        ) : (
                          <div className="sale-cells" role="list">
                            {filteredCatalog.map((item) => {
                              const qty =
                                builderMode === 'READY'
                                  ? readyQtyByItem.get(item.id) ?? 0
                                  : customQtyByItem.get(item.id) ?? 0;
                              const readyPos =
                                builderMode === 'READY'
                                  ? selectedReady.find((p) => p.itemId === item.id)
                                  : undefined;
                              return (
                                <div
                                  key={item.id}
                                  role="listitem"
                                  className={`sale-cell${qty > 0 ? ' sale-cell--active' : ''}`}
                                >
                                  <div className="sale-cell__top">
                                    <strong className="sale-cell__name">{item.name}</strong>
                                    <span className="sale-cell__meta">
                                      {itemTypeLabel(item.itemType)} · {item.code}
                                    </span>
                                  </div>
                                  <QtyStepper
                                    value={qty}
                                    disabled={busy}
                                    onDecrease={() =>
                                      builderMode === 'READY'
                                        ? bumpReadyQty(item.id, -1)
                                        : bumpCustomQty(item.id, -1)
                                    }
                                    onIncrease={() =>
                                      builderMode === 'READY'
                                        ? bumpReadyQty(item.id, 1)
                                        : bumpCustomQty(item.id, 1)
                                    }
                                  />
                                  {builderMode === 'READY' && qty > 0 ? (
                                    <div className="sale-cell__price">
                                      <label className="sale-cell__price-label" htmlFor={`price-${item.id}`}>
                                        Цена / шт
                                      </label>
                                      <MoneyBynInput
                                        id={`price-${item.id}`}
                                        value={readyPos?.unitPrice ?? ''}
                                        onChange={(unitPrice) =>
                                          setReadyUnitPrice(item.id, unitPrice)
                                        }
                                        required
                                      />
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {(selectedReady.length > 0 || customPartsCount > 0) && (
                          <div className="sale-cart">
                            <div className="sale-cart__head">В продаже</div>
                            <ul className="sale-cart__list">
                              {selectedReady.map((pos) => {
                                const item = items.find((row) => row.id === pos.itemId);
                                return (
                                  <li key={pos.key} className="sale-cart__row">
                                    <div>
                                      <strong>{item?.name ?? 'Букет'}</strong>
                                      <span>
                                        Готовый · {pos.quantity} шт
                                        {pos.unitPrice
                                          ? ` · ${parseBynToApi(pos.unitPrice) ?? pos.unitPrice} BYN`
                                          : ''}
                                      </span>
                                    </div>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      disabled={busy}
                                      onClick={() => removePosition(pos.key)}
                                    >
                                      Убрать
                                    </Button>
                                  </li>
                                );
                              })}
                              {activeCustom && customPartsCount > 0 ? (
                                <li className="sale-cart__row">
                                  <div>
                                    <strong>{activeCustom.name.trim() || 'Собранный букет'}</strong>
                                    <span>
                                      Сборка · {customPartsCount} поз.
                                      {activeCustom.price
                                        ? ` · ${parseBynToApi(activeCustom.price) ?? activeCustom.price} BYN`
                                        : ''}
                                    </span>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    disabled={busy}
                                    onClick={() => removePosition(activeCustom.key)}
                                  >
                                    Убрать
                                  </Button>
                                </li>
                              ) : null}
                            </ul>
                          </div>
                        )}
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
                    {summaryLines.length === 0 ? (
                      <li>
                        <div className="sale-summary__row">
                          <div>
                            <strong>Пока пусто</strong>
                            <p>Выберите тип и наберите товары ячейками</p>
                          </div>
                          <span>—</span>
                        </div>
                      </li>
                    ) : (
                      summaryLines.map((line) => (
                        <li key={line.key}>
                          <div className="sale-summary__row">
                            <div>
                              <strong>{line.title}</strong>
                              <p>{line.detail}</p>
                            </div>
                            <span>{line.amount ? `${line.amount} BYN` : '—'}</span>
                          </div>
                        </li>
                      ))
                    )}
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
