'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { AutoNumberNote, Field } from '@/components/layout/field';
import { FancySelect } from '@/components/layout/fancy-select';
import { MoneyBynInput, parseBynToApi } from '@/components/layout/money-byn-input';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';
import { InlineAlert } from '@/components/workspace/workspace-ui';
import { formatApiErrorMessage } from '@/lib/format-api-error';

type DashOrder = { id: string; number: string; status: string; readyAt?: string | null };

type CustomerOption = { id: string; name: string; phone: string; status: string };

const OCCASIONS = [
  { value: 'BIRTHDAY', label: 'День рождения' },
  { value: 'WEDDING', label: 'Свадьба' },
  { value: 'ROMANTIC', label: 'Романтика' },
  { value: 'CORPORATE', label: 'Корпоратив' },
  { value: 'FUNERAL', label: 'Траур' },
  { value: 'MOTHER_DAY', label: 'День матери' },
  { value: 'NEW_YEAR', label: 'Новый год' },
  { value: 'OTHER', label: 'Другое' },
] as const;

export default function OrdersPage() {
  const params = useParams<{ organizationId: string; storeId: string }>();
  const router = useRouter();
  const auth = useAuth();
  const { organizationId, storeId } = params;
  const base = `/organizations/${organizationId}/stores/${storeId}`;

  const [dashboard, setDashboard] = useState<{
    today: DashOrder[];
    overdue: DashOrder[];
    unassigned: DashOrder[];
    partiallyReserved: DashOrder[];
    ready: DashOrder[];
    inProgress: DashOrder[];
  } | null>(null);
  const [orders, setOrders] = useState<DashOrder[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [orderType, setOrderType] = useState<'PICKUP' | 'DELIVERY'>('PICKUP');
  const [customerId, setCustomerId] = useState('');
  const [occasion, setOccasion] = useState<string>('OTHER');
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [readyAt, setReadyAt] = useState('');
  const [plannedPrice, setPlannedPrice] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryCity, setDeliveryCity] = useState('');
  const [storeCity, setStoreCity] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const client = getApiClient();
      const [dash, list, warehouses, customerList, store] = await Promise.all([
        client.getOrderDashboard(organizationId, storeId),
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
      ]);
      setDashboard(dash);
      setOrders(list);
      setCustomers(customerList.filter((c) => c.status === 'ACTIVE'));
      const wh = warehouses.find((w) => w.isDefault) ?? warehouses[0];
      if (wh) setWarehouseId(wh.id);
      const city = store.city?.trim() || '';
      setStoreCity(city);
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
      if (!readyAt) {
        throw new Error('Укажите время готовности / доставки');
      }
      if (orderType === 'DELIVERY' && !deliveryAddress.trim()) {
        throw new Error('Для доставки укажите адрес');
      }
      const created = await getApiClient().createOrder(organizationId, storeId, {
        warehouseId,
        type: orderType,
        occasion,
        customerId: customerId || undefined,
        recipientName: recipientName.trim(),
        recipientPhone: recipientPhone.trim() || undefined,
        readyAt: new Date(readyAt).toISOString(),
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

  function Bucket({ title, items, tone }: { title: string; items: DashOrder[]; tone: string }) {
    return (
      <div className="order-dashboard__bucket">
        <h3>
          {title} <StatusBadge status={tone} />
        </h3>
        {items.length === 0 ? (
          <p className="order-dashboard__empty">Пусто</p>
        ) : (
          <ul>
            {items.map((item) => (
              <li key={item.id}>
                <Link href={`${base}/orders/${item.id}`}>{item.number}</Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
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
          description="Простой заказ: кто, когда, самовывоз или доставка с адресом. Пустой город = город магазина."
          breadcrumbs={[
            { label: 'Магазин', href: base },
            { label: 'Заказы' },
          ]}
          actions={
            auth.hasPermission('sales:create') ? (
              <Button type="button" variant="secondary" onClick={() => router.push(`${base}/sales/new`)}>
                Новая продажа
              </Button>
            ) : undefined
          }
        />

        <Section>
          <div className="concept-callout">
            <strong>Заказ → продажа</strong>
            <p>
              Заказ готовим к сроку. При доставке адрес указываем сразу — доставка создаётся
              автоматически. Когда букет выдан, оформляем продажу.
            </p>
          </div>
        </Section>

        <Section>
          {loading ? <LoadingState /> : null}
          {error ? <ErrorState message={error} /> : null}
          {dashboard ? (
            <div className="order-dashboard">
              <Bucket title="Сегодня" items={dashboard.today} tone="CONFIRMED" />
              <Bucket title="Просроченные" items={dashboard.overdue} tone="OVERDUE" />
              <Bucket title="Без флориста" items={dashboard.unassigned} tone="UNASSIGNED" />
              <Bucket
                title="Частично зарезервированные"
                items={dashboard.partiallyReserved}
                tone="PARTIALLY_RESERVED"
              />
              <Bucket title="Готовые" items={dashboard.ready} tone="READY" />
              <Bucket title="В работе" items={dashboard.inProgress} tone="IN_PREPARATION" />
            </div>
          ) : null}
        </Section>

        {canCreate ? (
          <Section>
            <Card title="Новый заказ">
              {!warehouseId ? (
                <InlineAlert tone="danger" title="Нет склада">
                  Без склада заказ создать нельзя. Обновите страницу или создайте склад магазина.
                </InlineAlert>
              ) : null}
              <p className="form-lead">Минимум полей: способ, получатель, время. Адрес — сразу, если доставка.</p>
              <form onSubmit={onCreate} className="stack-form" noValidate>
                <AutoNumberNote label="Номер заказа" />

                <Field label="Способ получения" required>
                  <FancySelect
                    value={orderType}
                    onChange={(v) => setOrderType(v as 'PICKUP' | 'DELIVERY')}
                    options={[
                      { value: 'PICKUP', label: 'Самовывоз к времени' },
                      { value: 'DELIVERY', label: 'Доставка' },
                    ]}
                    searchable={false}
                  />
                </Field>

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

                <Field label="Повод">
                  <FancySelect
                    value={occasion}
                    onChange={setOccasion}
                    options={OCCASIONS.map((o) => ({ value: o.value, label: o.label }))}
                    searchable={false}
                  />
                </Field>

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

                <Field
                  label={orderType === 'DELIVERY' ? 'Время доставки' : 'Время готовности'}
                  required
                >
                  <Input
                    type="datetime-local"
                    value={readyAt}
                    onChange={(e) => setReadyAt(e.target.value)}
                    required
                  />
                </Field>

                {orderType === 'DELIVERY' ? (
                  <>
                    <Field
                      label="Адрес доставки"
                      tooltip="Улица, дом, корпус, квартира"
                      required
                    >
                      <Input
                        value={deliveryAddress}
                        onChange={(e) => setDeliveryAddress(e.target.value)}
                        placeholder="ул. Независимости, 10, кв. 5"
                        required
                      />
                    </Field>
                    <Field
                      label="Город"
                      tooltip={
                        storeCity
                          ? `Если пусто — подставим город магазина: ${storeCity}`
                          : 'Если пусто — город магазина (или Минск по умолчанию)'
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

                <Button type="submit" disabled={creating || !warehouseId}>
                  {creating ? 'Создание…' : 'Создать заказ'}
                </Button>
              </form>
            </Card>
          </Section>
        ) : null}

        <Section>
          <Card title="Очередь заказов">
            {!loading && orders.length === 0 ? <EmptyState message="Заказов пока нет." /> : null}
            <ul className="list-stack">
              {orders.map((item) => (
                <li key={item.id}>
                  <Link href={`${base}/orders/${item.id}`}>
                    <div className="meta-row">
                      <strong>{item.number}</strong>
                      <StatusBadge status={item.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      </PageContainer>
    </main>
  );
}
