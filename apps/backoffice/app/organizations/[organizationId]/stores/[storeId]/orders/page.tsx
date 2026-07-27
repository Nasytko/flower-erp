'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { AutoNumberNote, Field } from '@/components/layout/field';
import { AddressAutocomplete } from '@/components/layout/address-autocomplete';
import { FancySelect } from '@/components/layout/fancy-select';
import { MoneyBynInput, parseBynToApi } from '@/components/layout/money-byn-input';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/states';
import { InlineAlert } from '@/components/workspace/workspace-ui';
import { formatApiErrorMessage } from '@/lib/format-api-error';
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
  recipientName?: string | null;
};

type DeliveryRow = {
  id: string;
  orderId: string;
  status: string;
  handedOverAt?: string | null;
};

type CustomerOption = { id: string; name: string; phone: string; status: string };

const PHASE_TONE: Record<OrderPhase, string> = {
  NEW: 'warning',
  ASSEMBLED: 'info',
  IN_DELIVERY: 'accent',
  COMPLETED: 'success',
};

function OrderPhaseBadge({ phase }: { phase: OrderPhase }) {
  return (
    <span className={`status-badge status-badge--${PHASE_TONE[phase]}`}>
      {orderPhaseLabel(phase)}
    </span>
  );
}

export default function OrdersPage() {
  const params = useParams<{ organizationId: string; storeId: string }>();
  const router = useRouter();
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
  const [storeCity, setStoreCity] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<OrderListFilter>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const canReadDelivery = auth.hasPermission('delivery:read');

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

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      if (!warehouseId) {
        throw new Error('Не найден склад магазина. Обновите страницу или создайте склад.');
      }
      if (!recipientName.trim()) {
        throw new Error('Укажите получателя');
      }
      if (!readyDate) {
        throw new Error('Укажите дату');
      }
      if (orderType === 'DELIVERY' && !deliveryAddress.trim()) {
        throw new Error('Для доставки укажите адрес');
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
                  <Field label="Получатель" required>
                    <Input
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
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
                  >
                    <Input
                      type="date"
                      value={readyDate}
                      onChange={(e) => setReadyDate(e.target.value)}
                      required
                    />
                  </Field>
                  <Field label="Время" required>
                    <Input
                      type="time"
                      value={readyTime}
                      onChange={(e) => setReadyTime(e.target.value)}
                      required
                    />
                  </Field>
                </div>

                {orderType === 'DELIVERY' ? (
                  <>
                    <Field label="Адрес доставки" required>
                      <AddressAutocomplete
                        organizationId={organizationId}
                        storeId={storeId}
                        value={deliveryAddress}
                        onChange={setDeliveryAddress}
                        onSelect={(hit) => {
                          if (hit.city) setDeliveryCity(hit.city);
                        }}
                        city={deliveryCity || storeCity || undefined}
                        placeholder="ул. Независимости, 10"
                        required
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
                ['NEW', 'Новые'],
                ['ASSEMBLED', 'Собраны'],
                ['IN_DELIVERY', 'В доставке'],
                ['COMPLETED', 'Выполнены'],
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
                const phase = resolveOrderPhase(item, delivery);
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
                        <OrderPhaseBadge phase={phase} />
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
