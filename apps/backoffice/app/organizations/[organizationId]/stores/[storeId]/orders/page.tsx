'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { AutoNumberNote, Field } from '@/components/layout/field';
import { AddressAutocomplete } from '@/components/layout/address-autocomplete';
import { FancySelect } from '@/components/layout/fancy-select';
import { MoneyBynInput, parseBynToApi } from '@/components/layout/money-byn-input';
import { TimePicker } from '@/components/layout/time-picker';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/states';
import { InlineAlert } from '@/components/workspace/workspace-ui';
import { formatApiErrorMessage } from '@/lib/format-api-error';
import {
  type FieldErrors,
  firstFieldError,
  hasFieldErrors,
  requiredText,
} from '@/lib/form-validation';
import {
  combineDateAndTime,
  formatReadyAt,
  matchesOrderListFilter,
  orderPhaseLabel,
  resolveOrderPhase,
  type OrderListFilter,
  type OrderPhase,
} from '@/lib/order-ui';
import { statusLabelRu } from '@/lib/status-labels-ru';

type OrderRow = {
  id: string;
  number: string;
  status: string;
  type?: string;
  readyAt?: string | null;
  completedAt?: string | null;
  recipientName?: string | null;
  displayPhase?: string;
  displayPhaseLabel?: string;
  activeAssignment?: { id: string } | null;
};

type DeliveryRow = {
  id: string;
  orderId: string;
  status: string;
  handedOverAt?: string | null;
};

const ORDER_LIST_FILTERS: OrderListFilter[] = [
  'ALL',
  'DRAFT',
  'NEW',
  'IN_WORK',
  'READY',
  'HANDED_OFF',
  'HANDED_OFF_TODAY',
];

type CustomerOption = { id: string; name: string; phone: string; status: string };

const PHASE_TONE: Record<OrderPhase, string> = {
  DRAFT: 'neutral',
  NEW: 'warning',
  IN_WORK: 'info',
  READY: 'success',
  HANDED_OFF: 'success',
};

function OrderPhaseBadge({
  phase,
  orderType,
  displayPhaseLabel,
}: {
  phase: OrderPhase;
  orderType?: string;
  displayPhaseLabel?: string;
}) {
  return (
    <span className={`status-badge status-badge--${PHASE_TONE[phase]}`}>
      {displayPhaseLabel ??
        orderPhaseLabel(phase, { type: orderType, displayPhase: phase, displayPhaseLabel })}
    </span>
  );
}

export default function OrdersPage() {
  const params = useParams<{ organizationId: string; storeId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const auth = useAuth();
  const { organizationId, storeId } = params;
  const base = `/organizations/${organizationId}/stores/${storeId}`;

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [orderType, setOrderType] = useState<'PICKUP' | 'DELIVERY'>('PICKUP');
  const [customerId, setCustomerId] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [readyDate, setReadyDate] = useState('');
  const [readyTime, setReadyTime] = useState('12:00');
  const [comment, setComment] = useState('');
  const [plannedPrice, setPlannedPrice] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryCity, setDeliveryCity] = useState('');
  const [deliveryApartment, setDeliveryApartment] = useState('');
  const [deliveryComment, setDeliveryComment] = useState('');
  const [storeCity, setStoreCity] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<OrderListFilter>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const canReadDelivery = auth.hasPermission('delivery:read');

  useEffect(() => {
    const phase = searchParams.get('phase');
    if (phase && ORDER_LIST_FILTERS.includes(phase as OrderListFilter)) {
      setFilter(phase as OrderListFilter);
    }
  }, [searchParams]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const client = getApiClient();
      const [list, warehouses, customerList, store, deliveryList] = await Promise.all([
        client.listOrders(organizationId, storeId),
        (async () => {
          let rows = await client.listWarehouses(organizationId, storeId);
          if (rows.length === 0 && auth.hasPermission('stores:create')) {
            rows = await client.ensureDefaultWarehouse(organizationId, storeId);
          }
          return rows;
        })(),
        auth.hasPermission('customers:read')
          ? client.listCustomers(organizationId)
          : Promise.resolve([] as CustomerOption[]),
        client.getStore(organizationId, storeId),
        canReadDelivery
          ? client.listDeliveries(organizationId, storeId)
          : Promise.resolve([] as DeliveryRow[]),
      ]);
      setOrders(list);
      setDeliveries(
        deliveryList.filter((d) => d.status !== 'CANCELLED').map((d) => ({
          id: d.id,
          orderId: d.orderId,
          status: d.status,
          handedOverAt: d.handedOverAt,
        })),
      );
      setCustomers(customerList.filter((c) => c.status === 'ACTIVE'));
      const wh = warehouses.find((w) => w.isDefault) ?? warehouses[0];
      if (wh) setWarehouseId(wh.id);
      setStoreCity(store.city?.trim() || '');
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось загрузить'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!auth.hasPermission('orders:read')) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, storeId, auth]);

  const deliveryByOrderId = useMemo(() => {
    const map = new Map<string, DeliveryRow>();
    for (const d of deliveries) {
      if (!map.has(d.orderId)) map.set(d.orderId, d);
    }
    return map;
  }, [deliveries]);

  const filteredOrders = useMemo(() => {
    return orders.filter((item) => {
      const delivery = deliveryByOrderId.get(item.id) ?? null;
      return matchesOrderListFilter(item, delivery, filter);
    });
  }, [orders, deliveryByOrderId, filter]);

  function validateCreate(): FieldErrors {
    const errors: FieldErrors = {
      recipientName: requiredText(recipientName, 'Укажите получателя'),
      readyDate: requiredText(readyDate, 'Укажите дату'),
      readyTime: requiredText(readyTime, 'Укажите время'),
    };
    if (orderType === 'DELIVERY') {
      errors.deliveryAddress = requiredText(deliveryAddress, 'Укажите адрес доставки');
    }
    return errors;
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    const errors = validateCreate();
    setFieldErrors(errors);
    if (hasFieldErrors(errors)) {
      setError(firstFieldError(errors));
      return;
    }
    setCreating(true);
    setError(null);
    try {
      if (!warehouseId) {
        throw new Error('Не найден склад магазина. Обновите страницу или создайте склад.');
      }
      const created = await getApiClient().createOrder(organizationId, storeId, {
        warehouseId,
        type: orderType,
        occasion: 'OTHER',
        customerId: customerId || undefined,
        recipientName: recipientName.trim(),
        recipientPhone: recipientPhone.trim() || undefined,
        readyAt: combineDateAndTime(readyDate, readyTime),
        comment: comment.trim() || undefined,
        plannedPrice: parseBynToApi(plannedPrice) ?? undefined,
        deliveryAddressLine:
          orderType === 'DELIVERY' ? deliveryAddress.trim() : undefined,
        deliveryCity:
          orderType === 'DELIVERY' ? deliveryCity.trim() || undefined : undefined,
        deliveryApartment:
          orderType === 'DELIVERY' ? deliveryApartment.trim() || undefined : undefined,
        deliveryComment:
          orderType === 'DELIVERY' ? deliveryComment.trim() || undefined : undefined,
      });
      router.push(`${base}/orders/${created.id}`);
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось создать заказ'));
      setCreating(false);
    }
  }

  if (!auth.hasPermission('orders:read')) {
    return <p className="page-state">Доступ запрещён</p>;
  }

  const canCreate = auth.hasPermission('orders:create');

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Заказы"
          description="Новый → Собран → Передан в доставку → Выполнен. Для доставки адрес указывается сразу."
          breadcrumbs={[
            { label: 'Магазин', href: base },
            { label: 'Заказы' },
          ]}
          actions={
            canCreate ? (
              <Button type="button" onClick={() => setShowCreate((v) => !v)}>
                {showCreate ? 'Скрыть' : 'Новый заказ'}
              </Button>
            ) : null
          }
        />

        {canCreate && showCreate ? (
          <Section>
            <Card title="Новый заказ">
              {!warehouseId ? (
                <InlineAlert tone="danger" title="Нет склада">
                  Без склада заказ создать нельзя. Обновите страницу или создайте склад магазина.
                </InlineAlert>
              ) : null}
              <form onSubmit={onCreate} className="stack-form" noValidate>
                <AutoNumberNote label="Номер заказа" />

                <div className="sale-mode" role="tablist" aria-label="Способ получения">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={orderType === 'PICKUP'}
                    className={`sale-mode__card${orderType === 'PICKUP' ? ' sale-mode__card--active' : ''}`}
                    onClick={() => setOrderType('PICKUP')}
                  >
                    <span className="sale-mode__title">Самовывоз</span>
                    <span className="sale-mode__text">Клиент заберёт к указанному времени</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={orderType === 'DELIVERY'}
                    className={`sale-mode__card${orderType === 'DELIVERY' ? ' sale-mode__card--active' : ''}`}
                    onClick={() => setOrderType('DELIVERY')}
                  >
                    <span className="sale-mode__title">Доставка</span>
                    <span className="sale-mode__text">Доставка появится на доске сразу после создания</span>
                  </button>
                </div>

                {customers.length > 0 ? (
                  <Field label="Клиент">
                    <FancySelect
                      value={customerId}
                      onChange={setCustomerId}
                      options={[
                        { value: '', label: 'Без привязки' },
                        ...customers.map((c) => ({
                          value: c.id,
                          label: c.name,
                          hint: c.phone,
                        })),
                      ]}
                      searchable
                      placeholder="Без привязки"
                    />
                  </Field>
                ) : null}

                <div className="sale-custom-meta">
                  <Field label="Получатель" required error={fieldErrors.recipientName}>
                    <Input
                      value={recipientName}
                      onChange={(e) => {
                        setRecipientName(e.target.value);
                        if (fieldErrors.recipientName) {
                          setFieldErrors((prev) => ({ ...prev, recipientName: undefined }));
                        }
                      }}
                      placeholder="Анна"
                      required
                    />
                  </Field>
                  <Field label="Телефон">
                    <Input
                      value={recipientPhone}
                      onChange={(e) => setRecipientPhone(e.target.value)}
                      placeholder="+375 …"
                      inputMode="tel"
                    />
                  </Field>
                </div>

                <div className="sale-custom-meta">
                  <Field
                    label={orderType === 'DELIVERY' ? 'Дата доставки' : 'Дата готовности'}
                    required
                    error={fieldErrors.readyDate}
                  >
                    <Input
                      type="date"
                      value={readyDate}
                      onChange={(e) => {
                        setReadyDate(e.target.value);
                        if (fieldErrors.readyDate) {
                          setFieldErrors((prev) => ({ ...prev, readyDate: undefined }));
                        }
                      }}
                      required
                    />
                  </Field>
                  <Field label="Время" required error={fieldErrors.readyTime}>
                    <TimePicker
                      value={readyTime}
                      onChange={(value) => {
                        setReadyTime(value);
                        if (fieldErrors.readyTime) {
                          setFieldErrors((prev) => ({ ...prev, readyTime: undefined }));
                        }
                      }}
                      required
                    />
                  </Field>
                </div>

                {orderType === 'DELIVERY' ? (
                  <>
                    <Field label="Адрес доставки" required error={fieldErrors.deliveryAddress}>
                      <AddressAutocomplete
                        organizationId={organizationId}
                        storeId={storeId}
                        value={deliveryAddress}
                        onChange={(value) => {
                          setDeliveryAddress(value);
                          if (fieldErrors.deliveryAddress) {
                            setFieldErrors((prev) => ({ ...prev, deliveryAddress: undefined }));
                          }
                        }}
                        onSelect={(hit) => {
                          if (hit.city) setDeliveryCity(hit.city);
                        }}
                        city={deliveryCity || storeCity || undefined}
                        placeholder="ул. Независимости, 10"
                        required
                      />
                    </Field>
                    <div className="sale-custom-meta">
                      <Field label="Квартира / офис">
                        <Input
                          value={deliveryApartment}
                          onChange={(e) => setDeliveryApartment(e.target.value)}
                          placeholder="12"
                        />
                      </Field>
                      <Field
                        label="Город"
                        tooltip={
                          storeCity
                            ? `Если пусто — город магазина: ${storeCity}`
                            : 'Если пусто — город магазина'
                        }
                      >
                        <Input
                          value={deliveryCity}
                          onChange={(e) => setDeliveryCity(e.target.value)}
                          placeholder={storeCity || 'Как у магазина'}
                        />
                      </Field>
                    </div>
                    <Field
                      label="Пометка к адресу"
                      hint="Для курьера: подъезд, домофон, ориентиры"
                    >
                      <Input
                        value={deliveryComment}
                        onChange={(e) => setDeliveryComment(e.target.value)}
                        placeholder="Подъезд 2, домофон 120, оставить у двери"
                      />
                    </Field>
                  </>
                ) : null}

                <Field label="Плановая цена">
                  <MoneyBynInput value={plannedPrice} onChange={setPlannedPrice} />
                </Field>

                <Field label="Пометка к заказу">
                  <Input
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Пожелания, особенности, комментарий для команды"
                  />
                </Field>

                <Button type="submit" disabled={creating || !warehouseId}>
                  {creating ? 'Создание…' : 'Создать заказ'}
                </Button>
              </form>
            </Card>
          </Section>
        ) : null}

        <Section>
          {loading ? <LoadingState /> : null}
          {error ? <ErrorState message={error} /> : null}

          <div className="order-filters" role="tablist" aria-label="Фильтр заказов">
            {(
              [
                ['ALL', 'Все'],
                ['DRAFT', 'Черновики'],
                ['NEW', 'Новые'],
                ['IN_WORK', 'В работе'],
                ['READY', 'Готовы'],
                ['HANDED_OFF_TODAY', 'Переданы сегодня'],
                ['HANDED_OFF', 'Переданы'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={filter === id}
                className={`order-filters__chip${filter === id ? ' order-filters__chip--active' : ''}`}
                onClick={() => setFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>

          <Card title="Очередь">
            {!loading && filteredOrders.length === 0 ? (
              <EmptyState message="Заказов в этом фильтре нет." />
            ) : null}
            <ul className="list-stack">
              {filteredOrders.map((item) => {
                const delivery = deliveryByOrderId.get(item.id) ?? null;
                const phase = resolveOrderPhase(
                  {
                    status: item.status,
                    type: item.type,
                    completedAt: item.completedAt,
                    displayPhase: item.displayPhase,
                    hasActiveAssignment: Boolean(item.activeAssignment),
                  },
                  delivery,
                );
                return (
                  <li key={item.id}>
                    <Link href={`${base}/orders/${item.id}`}>
                      <div className="meta-row">
                        <div>
                          <strong>{item.number}</strong>
                          <div className="order-queue__meta">
                            {item.type ? statusLabelRu(item.type) : null}
                            {item.recipientName ? ` · ${item.recipientName}` : null}
                            {item.readyAt ? ` · ${formatReadyAt(item.readyAt)}` : null}
                          </div>
                        </div>
                        <OrderPhaseBadge
                          phase={phase}
                          orderType={item.type}
                          displayPhaseLabel={item.displayPhaseLabel}
                        />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        </Section>
      </PageContainer>
    </main>
  );
}
