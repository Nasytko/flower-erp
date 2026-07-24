'use client';

import { Suspense, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { ApiClientError } from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { Field } from '@/components/layout/field';
import { MoneyBynInput, parseBynToApi } from '@/components/layout/money-byn-input';
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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    ])
      .then(([warehouses, catalog, order]) => {
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
  }, [organizationId, storeId, auth, fromOrderId]);

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
        message: 'Укажите название сборного букета',
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

  return (
    <main>
      <PageContainer>
        <PageHeader
          title={fromOrderId ? 'Продажа из заказа' : 'Сборный букет'}
          description={
            fromOrderId
              ? 'Продажа готового заказа: цена в BYN, списание состава заказа при завершении.'
              : 'Соберите букет из цветов магазина, укажите цену в BYN и продайте — остатки спишутся автоматически.'
          }
          breadcrumbs={[
            { label: 'Магазин', href: base },
            { label: 'Продажи', href: `${base}/sales` },
            { label: fromOrderId ? 'Из заказа' : 'Сборный букет' },
          ]}
        />

        {loading ? <LoadingState message="Загрузка каталога и склада магазина…" /> : null}
        {error ? <ErrorState message={error} /> : null}

        {!loading ? (
          <Section>
            <Card title={fromOrderId ? 'Из заказа' : 'Состав и цена'}>
              {!fromOrderId ? (
                <p className="form-lead">
                  Списание идёт со склада магазина
                  {warehouseLabel ? (
                    <>
                      : <strong>{warehouseLabel}</strong>
                    </>
                  ) : (
                    '.'
                  )}{' '}
                  Выбирать склад не нужно.
                </p>
              ) : (
                <p className="form-lead">
                  Проверьте цену. После продажи остатки спишутся по фактическому составу заказа.
                </p>
              )}

              <form onSubmit={onSubmit} className="stack-form">
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

                <Button type="submit" disabled={busy || (!fromOrderId && !warehouseId)}>
                  {busy
                    ? 'Продаём…'
                    : canComplete
                      ? 'Продать и списать со склада'
                      : 'Создать черновик продажи'}
                </Button>
                {canComplete ? (
                  <p className="field__hint">
                    После нажатия продажа сразу завершится, а состав букета спишется со склада
                    магазина.
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
