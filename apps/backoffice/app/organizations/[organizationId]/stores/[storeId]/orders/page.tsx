'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { ApiClientError } from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { Field } from '@/components/layout/field';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';

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
  const [customerId, setCustomerId] = useState('');
  const [occasion, setOccasion] = useState<string>('OTHER');
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [readyAt, setReadyAt] = useState('');
  const [referenceUrl, setReferenceUrl] = useState('');
  const [referenceComment, setReferenceComment] = useState('');
  const [plannedPrice, setPlannedPrice] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const client = getApiClient();
      const [dash, list, warehouses, customerList] = await Promise.all([
        client.getOrderDashboard(organizationId, storeId),
        client.listOrders(organizationId, storeId),
        client.listWarehouses(organizationId, storeId),
        auth.hasPermission('customers:read')
          ? client.listCustomers(organizationId)
          : Promise.resolve([] as CustomerOption[]),
      ]);
      setDashboard(dash);
      setOrders(list);
      setCustomers(customerList.filter((c) => c.status === 'ACTIVE'));
      const wh = warehouses.find((w) => w.isDefault) ?? warehouses[0];
      if (wh) setWarehouseId(wh.id);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось загрузить');
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
      const created = await getApiClient().createOrder(organizationId, storeId, {
        warehouseId,
        type: 'PICKUP',
        occasion,
        customerId: customerId || undefined,
        recipientName: recipientName || undefined,
        recipientPhone: recipientPhone || undefined,
        readyAt: readyAt || undefined,
        referenceUrl: referenceUrl || undefined,
        referenceComment: referenceComment || undefined,
        plannedPrice: plannedPrice || undefined,
      });
      router.push(`${base}/orders/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось создать');
      setCreating(false);
    }
  }

  function Bucket({ title, items, tone }: { title: string; items: DashOrder[]; tone: string }) {
    return (
      <div className="order-dashboard__bucket">
        <h3>
          {title} <StatusBadge status={tone} />
        </h3>
        {items.length === 0 ? <EmptyState message="—" /> : null}
        <ul>
          {items.map((item) => (
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
          description="Очередь флориста: сегодня, просрочка, назначение, частичный резерв."
          breadcrumbs={[
            { label: 'Организации', href: '/organizations' },
            { label: 'Организация', href: `/organizations/${organizationId}` },
            { label: 'Магазин', href: base },
            { label: 'Заказы' },
          ]}
        />

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
              <p className="form-lead">
                Заполните, кому и к какому времени нужен букет. Черновик можно уточнить после создания.
              </p>
              <form onSubmit={onCreate} className="stack-form">
                {customers.length > 0 ? (
                  <Field
                    label="Клиент"
                    hint="Необязательно: выберите постоянного клиента или оставьте пустым"
                  >
                    <select
                      className="field-control"
                      value={customerId}
                      onChange={(e) => setCustomerId(e.target.value)}
                    >
                      <option value="">Без привязки к клиенту</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} — {c.phone}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : null}
                <Field label="Повод" hint="Помогает флористу подобрать стиль букета" required>
                  <select
                    className="field-control"
                    value={occasion}
                    onChange={(e) => setOccasion(e.target.value)}
                  >
                    {OCCASIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Получатель" hint="Имя человека, которому доставят букет" required>
                  <Input
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    placeholder="Анна"
                    required
                  />
                </Field>
                <Field label="Телефон получателя" hint="Для связи курьера или магазина">
                  <Input
                    value={recipientPhone}
                    onChange={(e) => setRecipientPhone(e.target.value)}
                    placeholder="+7 …"
                    inputMode="tel"
                  />
                </Field>
                <Field
                  label="Готовность к"
                  hint="Дата и время, когда букет должен быть готов"
                  required
                >
                  <Input
                    type="datetime-local"
                    value={readyAt}
                    onChange={(e) => setReadyAt(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Ссылка на референс" hint="Необязательно: фото или Pinterest">
                  <Input
                    value={referenceUrl}
                    onChange={(e) => setReferenceUrl(e.target.value)}
                    placeholder="https://…"
                  />
                </Field>
                <Field label="Комментарий к референсу" hint="Что важно повторить или изменить">
                  <Input
                    value={referenceComment}
                    onChange={(e) => setReferenceComment(e.target.value)}
                    placeholder="Больше пионов, без хризантем"
                  />
                </Field>
                <Field label="Плановая цена, ₽" hint="Ориентир для клиента; можно уточнить позже">
                  <Input
                    value={plannedPrice}
                    onChange={(e) => setPlannedPrice(e.target.value)}
                    placeholder="4500"
                    inputMode="decimal"
                  />
                </Field>
                <Button type="submit" disabled={creating || !warehouseId}>
                  {creating ? 'Создание…' : 'Создать черновик'}
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
