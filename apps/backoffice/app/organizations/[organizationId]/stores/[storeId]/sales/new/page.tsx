'use client';

import { Suspense, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { ApiClientError } from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { ErrorState, LoadingState } from '@/components/layout/states';

type Warehouse = { id: string; name: string; code: string; isDefault: boolean };
type CatalogItem = { id: string; name: string; code: string };
type CompositionLine = { key: string; itemId: string; quantity: string };

const DISCOUNT_REASONS = [
  'PROMOTION',
  'LOYAL_CUSTOMER',
  'AGED_FLOWERS',
  'MANAGER_DECISION',
  'OTHER',
] as const;

function newKey() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `k_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export default function NewSalePage() {
  return (
    <Suspense fallback={<main><LoadingState message="Loading…" /></main>}>
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

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [description, setDescription] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [composition, setComposition] = useState<CompositionLine[]>([
    { key: newKey(), itemId: '', quantity: '1' },
  ]);
  const [itemQuery, setItemQuery] = useState('');
  const [discountType, setDiscountType] = useState<'NONE' | 'PERCENT' | 'FIXED'>('NONE');
  const [discountValue, setDiscountValue] = useState('');
  const [discountReason, setDiscountReason] = useState<string>('OTHER');
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completeAfterCreate, setCompleteAfterCreate] = useState(true);

  const filteredItems = useMemo(() => {
    const q = itemQuery.trim().toLowerCase();
    if (!q) return items.slice(0, 50);
    return items
      .filter((item) => item.name.toLowerCase().includes(q) || item.code.toLowerCase().includes(q))
      .slice(0, 50);
  }, [items, itemQuery]);

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
    ])
      .then(([wh, catalog, order]) => {
        if (cancelled) return;
        setWarehouses(wh);
        const defaultWh = wh.find((w) => w.isDefault) ?? wh[0];
        if (defaultWh) setWarehouseId(defaultWh.id);
        setItems(catalog.items);
        if (catalog.items[0]) {
          setComposition([{ key: newKey(), itemId: catalog.items[0].id, quantity: '1' }]);
        }
        if (order) {
          setUnitPrice(order.plannedPrice ?? '');
          setDescription(`Order ${order.number}`);
          setComment(order.comment ?? '');
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiClientError ? err.message : 'Failed to load');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, storeId, auth, fromOrderId]);

  function discountPayload() {
    if (discountType === 'NONE' || !auth.hasPermission('sales:discount')) return undefined;
    if (!discountValue.trim()) return undefined;
    return {
      type: discountType,
      value: discountValue.trim(),
      reason: discountReason,
    };
  }

  function buildDirectLines() {
    const price = unitPrice.trim();
    const lines = composition.filter((line) => line.itemId && line.quantity.trim());
    if (lines.length === 0) {
      throw new ApiClientError({
        message: 'Добавьте хотя бы одну позицию состава',
        code: 'VALIDATION',
        status: 400,
        requestId: 'local',
      });
    }
    if (!price) {
      throw new ApiClientError({
        message: 'Укажите цену коммерческой линии',
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
      description: index === 0 ? description.trim() || undefined : undefined,
    }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const client = getApiClient();
      let saleId: string;
      if (fromOrderId) {
        const created = await client.createSaleFromOrder(organizationId, storeId, fromOrderId, {
          unitPrice: unitPrice.trim() || undefined,
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

      if (completeAfterCreate && auth.hasPermission('sales:complete')) {
        await client.completeSale(organizationId, storeId, saleId, newKey());
        router.push(`${base}/sales/${saleId}?completed=1`);
        return;
      }
      router.push(`${base}/sales/${saleId}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Create failed');
      setBusy(false);
    }
  }

  if (!auth.hasPermission('sales:create')) {
    return <p className="page-state">Access denied</p>;
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title={fromOrderId ? 'Продажа из заказа' : 'Новая продажа'}
          description={
            fromOrderId
              ? 'Черновик ORDER_BASED из READY-заказа. Списание остатков — при завершении.'
              : 'Прямая продажа: коммерческая линия + состав со склада.'
          }
          breadcrumbs={[
            { label: 'Organizations', href: '/organizations' },
            { label: 'Organization', href: `/organizations/${organizationId}` },
            { label: 'Store', href: base },
            { label: 'Продажи', href: `${base}/sales` },
            { label: 'Новая' },
          ]}
        />

        {loading ? <LoadingState /> : null}
        {error ? <ErrorState message={error} /> : null}

        {!loading ? (
          <Section>
            <Card title={fromOrderId ? 'Из заказа' : 'Прямая продажа'}>
              <form onSubmit={onSubmit} className="stack-form">
                {!fromOrderId ? (
                  <label>
                    Склад
                    <select
                      value={warehouseId}
                      onChange={(e) => setWarehouseId(e.target.value)}
                      required
                    >
                      {warehouses.map((wh) => (
                        <option key={wh.id} value={wh.id}>
                          {wh.name} ({wh.code})
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                <Input
                  placeholder="Описание коммерческой линии"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required={!fromOrderId}
                />
                <Input
                  placeholder={fromOrderId ? 'Цена (override, опционально)' : 'Цена'}
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  required={!fromOrderId}
                />

                {!fromOrderId ? (
                  <div className="stack-form">
                    <strong>Состав (инвентарь)</strong>
                    <Input
                      placeholder="Поиск позиции…"
                      value={itemQuery}
                      onChange={(e) => setItemQuery(e.target.value)}
                    />
                    {composition.map((line, index) => (
                      <div key={line.key} className="meta-row" style={{ alignItems: 'stretch' }}>
                        <select
                          value={line.itemId}
                          onChange={(e) =>
                            setComposition((prev) =>
                              prev.map((row) =>
                                row.key === line.key ? { ...row, itemId: e.target.value } : row,
                              ),
                            )
                          }
                          required
                          style={{ flex: 1 }}
                        >
                          <option value="">Позиция</option>
                          {filteredItems.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name} ({item.code})
                            </option>
                          ))}
                          {line.itemId &&
                          !filteredItems.some((item) => item.id === line.itemId) ? (
                            <option value={line.itemId}>{line.itemId}</option>
                          ) : null}
                        </select>
                        <Input
                          placeholder="Кол-во"
                          value={line.quantity}
                          onChange={(e) =>
                            setComposition((prev) =>
                              prev.map((row) =>
                                row.key === line.key
                                  ? { ...row, quantity: e.target.value }
                                  : row,
                              ),
                            )
                          }
                          required
                          style={{ width: 100 }}
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
                        {index === composition.length - 1 ? (
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
                            +
                          </Button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}

                {auth.hasPermission('sales:discount') ? (
                  <div className="stack-form">
                    <strong>Скидка</strong>
                    <select
                      value={discountType}
                      onChange={(e) =>
                        setDiscountType(e.target.value as 'NONE' | 'PERCENT' | 'FIXED')
                      }
                    >
                      <option value="NONE">Без скидки</option>
                      <option value="PERCENT">Процент</option>
                      <option value="FIXED">Фиксированная</option>
                    </select>
                    {discountType !== 'NONE' ? (
                      <>
                        <Input
                          placeholder="Значение скидки"
                          value={discountValue}
                          onChange={(e) => setDiscountValue(e.target.value)}
                          required
                        />
                        <select
                          value={discountReason}
                          onChange={(e) => setDiscountReason(e.target.value)}
                        >
                          {DISCOUNT_REASONS.map((reason) => (
                            <option key={reason} value={reason}>
                              {reason}
                            </option>
                          ))}
                        </select>
                      </>
                    ) : null}
                  </div>
                ) : null}

                <Input
                  placeholder="Комментарий"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />

                {auth.hasPermission('sales:complete') ? (
                  <label className="meta-row">
                    <input
                      type="checkbox"
                      checked={completeAfterCreate}
                      onChange={(e) => setCompleteAfterCreate(e.target.checked)}
                    />
                    Сразу завершить продажу (списание со склада)
                  </label>
                ) : null}

                <Button type="submit" disabled={busy || (!fromOrderId && !warehouseId)}>
                  {busy
                    ? 'Сохранение…'
                    : completeAfterCreate && auth.hasPermission('sales:complete')
                      ? 'Создать и завершить'
                      : 'Создать черновик'}
                </Button>
              </form>
            </Card>
          </Section>
        ) : null}
      </PageContainer>
    </main>
  );
}
