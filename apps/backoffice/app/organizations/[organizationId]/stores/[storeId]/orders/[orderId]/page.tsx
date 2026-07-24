'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { ApiClientError } from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { AutoNumberNote, Field } from '@/components/layout/field';
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
import { StatusBadge } from '@/components/layout/status-badge';
import { statusLabelRu } from '@/lib/status-labels-ru';

type OrderDetail = Awaited<ReturnType<ReturnType<typeof getApiClient>['getOrder']>>;
type PaymentSummary = Awaited<ReturnType<ReturnType<typeof getApiClient>['getOrderPaymentSummary']>>;
type PaymentMethod = Awaited<
  ReturnType<ReturnType<typeof getApiClient>['listPaymentMethods']>
>[number];

function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `pay_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

const WORKFLOW_STEPS = [
  'DRAFT',
  'CONFIRMED',
  'PARTIALLY_RESERVED',
  'RESERVED',
  'IN_PREPARATION',
  'READY',
  'COMPLETED',
] as const;

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

function workflowTone(step: string, reached: boolean, isCurrent: boolean): string {
  if (!reached && !isCurrent) return 'neutral';
  if (step === 'COMPLETED' || step === 'READY') return 'success';
  if (step === 'RESERVED') return 'info';
  if (step === 'PARTIALLY_RESERVED') return 'warning';
  if (step === 'IN_PREPARATION') return 'accent';
  if (step === 'CONFIRMED' || step === 'DRAFT') return 'warning';
  return 'neutral';
}

export default function OrderDetailPage() {
  const params = useParams<{ organizationId: string; storeId: string; orderId: string }>();
  const auth = useAuth();
  const { organizationId, storeId, orderId } = params;
  const base = `/organizations/${organizationId}/stores/${storeId}`;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [items, setItems] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [itemId, setItemId] = useState('');
  const [plannedQuantity, setPlannedQuantity] = useState('1');
  const [actualItemId, setActualItemId] = useState('');
  const [actualQuantity, setActualQuantity] = useState('1');
  const [membershipId, setMembershipId] = useState('');
  const [commentMessage, setCommentMessage] = useState('');
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [paymentLines, setPaymentLines] = useState<PaymentSplitLine[]>([createEmptyPaymentLine()]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [linkedDeliveryId, setLinkedDeliveryId] = useState<string | null>(null);
  const [linkedDeliveryNumber, setLinkedDeliveryNumber] = useState<string | null>(null);
  const [createDeliveryOpen, setCreateDeliveryOpen] = useState(false);

  const canReadPayments = auth.hasPermission('payments:read');
  const canReadDelivery = auth.hasPermission('delivery:read');

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const client = getApiClient();
      const [detail, catalog, summary, methods, deliveries] = await Promise.all([
        client.getOrder(organizationId, storeId, orderId),
        client.listItems(organizationId, { pageSize: 100, status: 'ACTIVE' }),
        canReadPayments
          ? client.getOrderPaymentSummary(organizationId, storeId, orderId)
          : Promise.resolve(null),
        canReadPayments &&
        (auth.hasPermission('payments:create') || auth.hasPermission('payments:complete'))
          ? client.listPaymentMethods(organizationId, storeId, { activeOnly: true })
          : Promise.resolve([] as PaymentMethod[]),
        canReadDelivery
          ? client.listDeliveries(organizationId, storeId)
          : Promise.resolve([]),
      ]);
      setOrder(detail);
      setItems(catalog.items);
      setPaymentSummary(summary);
      const linked = deliveries.find(
        (d) => d.orderId === orderId && d.status !== 'CANCELLED',
      );
      setLinkedDeliveryId(linked?.id ?? null);
      setLinkedDeliveryNumber(linked?.number ?? null);
      setPaymentMethods(methods);
      if (methods[0]) {
        setPaymentLines((prev) =>
          prev.length === 1 && !prev[0]!.methodId && !prev[0]!.amount
            ? [createEmptyPaymentLine(methods[0]!.id)]
            : prev,
        );
      }
      if (catalog.items[0]) {
        setItemId((prev) => prev || catalog.items[0]!.id);
        setActualItemId((prev) => prev || catalog.items[0]!.id);
      }
      if (detail.activeAssignment?.membershipId) {
        setMembershipId(detail.activeAssignment.membershipId);
      }
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
  }, [organizationId, storeId, orderId, auth]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Действие не выполнено');
    } finally {
      setBusy(false);
    }
  }

  async function resolveMyMembershipId(): Promise<string> {
    if (!auth.user?.login) {
      throw new ApiClientError({
        message: 'Нет пользователя сессии',
        code: 'UNAUTHENTICATED',
        status: 401,
        requestId: 'local',
      });
    }
    const users = await getApiClient().listUsers(organizationId);
    const me = users.find((u) => u.login === auth.user!.login);
    if (!me?.membershipId) {
      throw new ApiClientError({
        message: 'Участник не найден для текущего пользователя',
        code: 'NOT_FOUND',
        status: 404,
        requestId: 'local',
      });
    }
    return me.membershipId;
  }

  async function onAddCompositionItem(event: FormEvent) {
    event.preventDefault();
    await run(() =>
      getApiClient().addCompositionItem(organizationId, storeId, orderId, {
        itemId,
        plannedQuantity,
      }),
    );
  }

  async function onSetActualFromForm(event: FormEvent) {
    event.preventDefault();
    const existing =
      order?.actualComposition?.items.map((line) => ({
        itemId: line.itemId,
        actualQuantity: line.actualQuantity,
        batchId: line.batchId,
        comment: line.comment ?? undefined,
        sortOrder: line.sortOrder,
      })) ?? [];
    const withoutDup = existing.filter((line) => line.itemId !== actualItemId);
    await run(async () => {
      const client = getApiClient();
      const workOrder = await client.getWorkOrder(organizationId, storeId, orderId);
      await client.setActualComposition(organizationId, storeId, orderId, {
        expectedVersion: workOrder.version,
        items: [...withoutDup, { itemId: actualItemId, actualQuantity }],
      });
    });
  }

  async function onAddComment(event: FormEvent) {
    event.preventDefault();
    if (!commentMessage.trim()) return;
    await run(async () => {
      await getApiClient().addOrderComment(organizationId, storeId, orderId, {
        message: commentMessage.trim(),
      });
      setCommentMessage('');
    });
  }

  async function onAddPrepayment(event: FormEvent) {
    event.preventDefault();
    const payments = parsePaymentSplit(paymentLines);
    if (payments.length === 0) return;
    await run(async () => {
      const client = getApiClient();
      for (const payment of payments) {
        const created = await client.createOrderPayment(organizationId, storeId, orderId, payment);
        if (auth.hasPermission('payments:complete') && created.status === 'DRAFT') {
          await client.completePayment(
            organizationId,
            storeId,
            created.id,
            newIdempotencyKey(),
          );
        }
      }
      setPaymentLines([createEmptyPaymentLine(paymentMethods[0]?.id ?? '')]);
    });
  }

  if (!auth.hasPermission('orders:read')) {
    return <p className="page-state">Доступ запрещён</p>;
  }

  const client = getApiClient();
  const draft = order?.status === 'DRAFT';
  const inPrep = order?.status === 'IN_PREPARATION';
  const currentIdx = order ? WORKFLOW_STEPS.indexOf(order.status as (typeof WORKFLOW_STEPS)[number]) : -1;

  return (
    <main>
      <PageContainer>
        <PageHeader
          title={order ? `Заказ ${order.number}` : 'Заказ'}
          description="Заказ к времени. Когда готов и передан клиенту — оформляется продажа. Номер системы не меняется."
          breadcrumbs={[
            { label: 'Магазин', href: base },
            { label: 'Заказы', href: `${base}/orders` },
            { label: order?.number ?? 'Карточка' },
          ]}
          actions={order ? <StatusBadge status={order.status} /> : undefined}
        />

        {loading ? <LoadingState /> : null}
        {error ? <ErrorState message={error} /> : null}

        {order ? (
          <>
            <div className="order-workflow" aria-label="Статусы заказа">
              {WORKFLOW_STEPS.map((step) => {
                const stepIdx = WORKFLOW_STEPS.indexOf(step);
                const reached =
                  order.status === 'CANCELLED'
                    ? false
                    : currentIdx >= 0 && stepIdx >= 0 && stepIdx <= currentIdx;
                const isCurrent = order.status === step;
                return (
                  <span
                    key={step}
                    className={`status-badge status-badge--${workflowTone(
                      step,
                      reached,
                      isCurrent,
                    )}${isCurrent ? ' order-workflow__current' : ''}`}
                  >
                    {statusLabelRu(step)}
                  </span>
                );
              })}
              {order.status === 'CANCELLED' ? <StatusBadge status="CANCELLED" /> : null}
              {order.hasDeficit ? <StatusBadge status="DEFICIT" /> : null}
            </div>

            <Section>
              <Card title="Клиент / референс / сроки">
                <AutoNumberNote label="Номер заказа" value={order.number} />
                {draft && auth.hasPermission('orders:update') ? (
                  <form
                    className="stack-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      void run(() =>
                        client.updateOrder(organizationId, storeId, orderId, {
                          recipientName: String(form.get('recipientName') || '') || null,
                          recipientPhone: String(form.get('recipientPhone') || '') || null,
                          comment: String(form.get('comment') || '') || null,
                          readyAt: String(form.get('readyAt') || '') || null,
                          type: String(form.get('type') || order.type),
                          occasion: String(form.get('occasion') || order.occasion),
                          referenceUrl: String(form.get('referenceUrl') || '') || null,
                          referenceComment: String(form.get('referenceComment') || '') || null,
                          plannedPrice: String(form.get('plannedPrice') || '') || null,
                        }),
                      );
                    }}
                  >
                    <Field label="Способ получения" required>
                      <select name="type" className="field-control" defaultValue={order.type}>
                        <option value="PICKUP">Самовывоз из магазина к времени</option>
                        <option value="DELIVERY">Доставка клиенту</option>
                      </select>
                    </Field>
                    <Field label="Повод" required>
                      <select name="occasion" className="field-control" defaultValue={order.occasion}>
                        {OCCASIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Получатель">
                      <Input
                        name="recipientName"
                        defaultValue={order.recipientName ?? ''}
                        placeholder="Анна"
                      />
                    </Field>
                    <Field label="Телефон получателя">
                      <Input
                        name="recipientPhone"
                        defaultValue={order.recipientPhone ?? ''}
                        placeholder="+375 …"
                        inputMode="tel"
                      />
                    </Field>
                    <Field
                      label={
                        order.type === 'DELIVERY'
                          ? 'К какому времени доставить'
                          : 'К какому времени готов'
                      }
                    >
                      <Input
                        name="readyAt"
                        type="datetime-local"
                        defaultValue={
                          order.readyAt ? new Date(order.readyAt).toISOString().slice(0, 16) : ''
                        }
                      />
                    </Field>
                    <Field label="Ссылка на референс">
                      <Input
                        name="referenceUrl"
                        defaultValue={order.referenceUrl ?? ''}
                        placeholder="https://…"
                      />
                    </Field>
                    <Field label="Комментарий к референсу">
                      <Input
                        name="referenceComment"
                        defaultValue={order.referenceComment ?? ''}
                        placeholder="Что учесть во флористике"
                      />
                    </Field>
                    <Field label="Плановая цена, BYN">
                      <Input
                        name="plannedPrice"
                        defaultValue={order.plannedPrice ?? ''}
                        placeholder="0.00"
                        inputMode="decimal"
                      />
                    </Field>
                    <Field label="Комментарий">
                      <Input
                        name="comment"
                        defaultValue={order.comment ?? ''}
                        placeholder="Заметки для команды"
                      />
                    </Field>
                    <Button type="submit" disabled={busy}>
                      Сохранить черновик
                    </Button>
                  </form>
                ) : (
                  <div className="stack-form">
                    <div className="meta-row">
                      <span>{statusLabelRu(order.type)}</span>
                      <span>{statusLabelRu(order.occasion)}</span>
                      <span>{order.recipientName ?? '—'}</span>
                      <span>{order.recipientPhone ?? '—'}</span>
                      <span>
                        {order.readyAt ? new Date(order.readyAt).toLocaleString() : 'без срока'}
                      </span>
                    </div>
                    {order.customerNameSnapshot || order.customerPhoneSnapshot ? (
                      <p>
                        Клиент: {order.customerNameSnapshot ?? '—'}{' '}
                        {order.customerPhoneSnapshot ?? ''}
                      </p>
                    ) : null}
                    {order.plannedPrice ? <p>Плановая цена: {order.plannedPrice}</p> : null}
                    {order.referenceUrl ? (
                      <p>
                        Ref:{' '}
                        <a href={order.referenceUrl} target="_blank" rel="noreferrer">
                          {order.referenceUrl}
                        </a>
                      </p>
                    ) : null}
                    {order.referenceComment ? <p>{order.referenceComment}</p> : null}
                    {order.comment ? <p>{order.comment}</p> : null}
                  </div>
                )}
              </Card>
            </Section>

            <Section>
              <Card title="Исполнение (fulfillment)">
                <div className="meta-row">
                  <StatusBadge status={order.type} />
                  <span>{order.type === 'DELIVERY' ? 'Доставка' : 'Самовывоз'}</span>
                </div>
                {order.type === 'DELIVERY' && canReadDelivery ? (
                  <div className="stack-form" style={{ marginTop: 12 }}>
                    {linkedDeliveryId ? (
                      <p>
                        Доставка:{' '}
                        <Link href={`${base}/deliveries/${linkedDeliveryId}`}>
                          {linkedDeliveryNumber ?? linkedDeliveryId}
                        </Link>
                      </p>
                    ) : auth.hasPermission('delivery:create') ? (
                      <>
                        {!createDeliveryOpen ? (
                          <Button
                            type="button"
                            disabled={busy}
                            onClick={() => setCreateDeliveryOpen(true)}
                          >
                            Создать доставку
                          </Button>
                        ) : (
                          <form
                            className="stack-form"
                            onSubmit={(event) => {
                              event.preventDefault();
                              const form = new FormData(event.currentTarget);
                              const deliveryDate = String(form.get('deliveryDate') || '');
                              const windowStartLocal = String(form.get('windowStart') || '');
                              const windowEndLocal = String(form.get('windowEnd') || '');
                              void run(async () => {
                                const created = await getApiClient().createDeliveryFromOrder(
                                  organizationId,
                                  storeId,
                                  orderId,
                                  {
                                    method: String(form.get('method') || 'OWN_COURIER'),
                                    deliveryDate: new Date(deliveryDate).toISOString(),
                                    windowStart: new Date(windowStartLocal).toISOString(),
                                    windowEnd: new Date(windowEndLocal).toISOString(),
                                    addressLine: String(form.get('addressLine') || ''),
                                    city: String(form.get('city') || ''),
                                    recipientName:
                                      String(form.get('recipientName') || '') ||
                                      order.recipientName,
                                    recipientPhone:
                                      String(form.get('recipientPhone') || '') ||
                                      order.recipientPhone,
                                  },
                                );
                                setLinkedDeliveryId(created.id);
                                setLinkedDeliveryNumber(created.number);
                                setCreateDeliveryOpen(false);
                              });
                            }}
                          >
                            <select name="method" defaultValue="OWN_COURIER">
                              <option value="OWN_COURIER">Свой курьер</option>
                              <option value="TAXI">Такси</option>
                              <option value="THIRD_PARTY_SERVICE">Сторонний сервис</option>
                            </select>
                            <Input
                              name="deliveryDate"
                              type="date"
                              required
                              defaultValue={new Date().toISOString().slice(0, 10)}
                            />
                            <Input
                              name="windowStart"
                              type="datetime-local"
                              required
                              defaultValue={new Date().toISOString().slice(0, 16)}
                            />
                            <Input
                              name="windowEnd"
                              type="datetime-local"
                              required
                              defaultValue={new Date(Date.now() + 2 * 3600_000)
                                .toISOString()
                                .slice(0, 16)}
                            />
                            <Input
                              name="addressLine"
                              placeholder="Адрес"
                              required
                              defaultValue=""
                            />
                            <Input name="city" placeholder="Город" required defaultValue="" />
                            <Input
                              name="recipientName"
                              placeholder="Получатель"
                              defaultValue={order.recipientName ?? ''}
                            />
                            <Input
                              name="recipientPhone"
                              placeholder="Телефон"
                              defaultValue={order.recipientPhone ?? ''}
                            />
                            <div className="delivery-action-row">
                              <Button type="submit" disabled={busy}>
                                Создать
                              </Button>
                              <Button
                                type="button"
                                variant="secondary"
                                onClick={() => setCreateDeliveryOpen(false)}
                              >
                                Отмена
                              </Button>
                            </div>
                          </form>
                        )}
                      </>
                    ) : (
                      <p>Доставка ещё не создана.</p>
                    )}
                  </div>
                ) : null}
              </Card>
            </Section>

            <Section>
              <Card title="Плановый состав">
                <ul className="list-stack">
                  {(order.composition?.items ?? []).map((line) => (
                    <li key={line.id}>
                      <div className="meta-row">
                        <strong>
                          {line.item?.name ?? line.itemId} × {line.plannedQuantity}
                        </strong>
                        <span>резерв {line.reservedQuantity ?? '0'}</span>
                        {line.deficitQuantity && line.deficitQuantity !== '0' ? (
                          <StatusBadge status="DEFICIT" />
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
                {draft && auth.hasPermission('orders:update') ? (
                  <form onSubmit={onAddCompositionItem} className="stack-form" style={{ marginTop: 16 }}>
                    <select value={itemId} onChange={(e) => setItemId(e.target.value)}>
                      {items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.code})
                        </option>
                      ))}
                    </select>
                    <Input
                      value={plannedQuantity}
                      onChange={(e) => setPlannedQuantity(e.target.value)}
                      placeholder="Количество"
                    />
                    <Button type="submit" disabled={busy || !itemId}>
                      Добавить позицию
                    </Button>
                  </form>
                ) : null}
              </Card>
            </Section>

            {inPrep || order.actualComposition ? (
              <Section>
                <Card title="Фактический состав">
                  {order.actualComposition?.frozenAt ? (
                    <p style={{ color: 'var(--color-muted)', fontSize: 'var(--text-sm)' }}>
                      Заморожен {new Date(order.actualComposition.frozenAt).toLocaleString()}
                    </p>
                  ) : null}
                  <ul className="list-stack">
                    {(order.actualComposition?.items ?? []).map((line) => (
                      <li key={line.id}>
                        <div className="meta-row">
                          <strong>
                            {line.item?.name ?? line.itemId} × {line.actualQuantity}
                          </strong>
                        </div>
                      </li>
                    ))}
                  </ul>
                  {inPrep &&
                  !order.actualComposition?.frozenAt &&
                  auth.hasPermission('orders:prepare') ? (
                    <form
                      onSubmit={onSetActualFromForm}
                      className="stack-form"
                      style={{ marginTop: 16 }}
                    >
                      <select
                        value={actualItemId}
                        onChange={(e) => setActualItemId(e.target.value)}
                      >
                        {items.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name} ({item.code})
                          </option>
                        ))}
                      </select>
                      <Input
                        value={actualQuantity}
                        onChange={(e) => setActualQuantity(e.target.value)}
                        placeholder="Факт. количество"
                      />
                      <Button type="submit" disabled={busy || !actualItemId}>
                        Сохранить позицию факта
                      </Button>
                    </form>
                  ) : null}
                </Card>
              </Section>
            ) : null}

            <Section>
              <Card title="Назначение флориста">
                <div className="stack-form">
                  {order.activeAssignment ? (
                    <div className="meta-row">
                      <span>membership: {order.activeAssignment.membershipId}</span>
                      <span>
                        с {new Date(order.activeAssignment.assignedAt).toLocaleString()}
                      </span>
                    </div>
                  ) : (
                    <p style={{ margin: 0, color: 'var(--color-muted)' }}>Не назначен</p>
                  )}
                  {auth.hasPermission('orders:assign') ? (
                    <>
                      <Input
                        value={membershipId}
                        onChange={(e) => setMembershipId(e.target.value)}
                        placeholder="membershipId"
                      />
                      <div className="page-header__actions">
                        <Button
                          type="button"
                          disabled={busy || !membershipId}
                          onClick={() =>
                            void run(() =>
                              client.assignFlorist(organizationId, storeId, orderId, {
                                membershipId,
                              }),
                            )
                          }
                        >
                          Назначить
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              const mid = await resolveMyMembershipId();
                              setMembershipId(mid);
                              await client.assignFlorist(organizationId, storeId, orderId, {
                                membershipId: mid,
                              });
                            })
                          }
                        >
                          Назначить себя
                        </Button>
                        {order.activeAssignment ? (
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={busy}
                            onClick={() =>
                              void run(() =>
                                client.releaseAssignment(organizationId, storeId, orderId, {
                                  reason: 'Released from order admin',
                                }),
                              )
                            }
                          >
                            Снять назначение
                          </Button>
                        ) : null}
                      </div>
                    </>
                  ) : null}
                </div>
              </Card>
            </Section>

            {canReadPayments ? (
              <Section>
                <Card title="Оплата">
                  <p className="form-lead">
                    Можно принять предоплату одним или несколькими способами (например карта
                    сейчас, наличные при выдаче). Остаток закроется при оформлении продажи.
                  </p>
                  {paymentSummary ? (
                    <div className="stack-form">
                      <div className="meta-row">
                        <StatusBadge status={paymentSummary.status} />
                        <span>Итого: {paymentSummary.totalAmount}</span>
                        <span>Оплачено: {paymentSummary.paidAmount}</span>
                        <span>Возврат: {paymentSummary.refundedAmount}</span>
                        <span>К доплате: {paymentSummary.balanceDue}</span>
                      </div>
                    </div>
                  ) : (
                    <p style={{ margin: 0, color: 'var(--color-muted)' }}>Сводка недоступна.</p>
                  )}
                  {auth.hasPermission('payments:create') &&
                  auth.hasPermission('payments:complete') &&
                  order.status !== 'DRAFT' &&
                  order.status !== 'CANCELLED' ? (
                    <form
                      onSubmit={onAddPrepayment}
                      className="stack-form"
                      style={{ marginTop: 16 }}
                    >
                      <PaymentSplitEditor
                        methods={paymentMethods}
                        lines={paymentLines}
                        onChange={setPaymentLines}
                        expectedAmount={
                          paymentSummary?.balanceDue ?? order.plannedPrice ?? undefined
                        }
                        required
                        disabled={busy}
                        label="Предоплата / оплата"
                      />
                      <Button
                        type="submit"
                        disabled={busy || parsePaymentSplit(paymentLines).length === 0}
                      >
                        Зафиксировать оплату
                      </Button>
                    </form>
                  ) : null}
                  <p style={{ margin: '12px 0 0' }}>
                    <Link href={`${base}/payments`}>Все платежи магазина</Link>
                  </p>
                </Card>
              </Section>
            ) : null}

            <Section>
              <Card title="Действия">
                <div className="page-header__actions">
                  {order.status === 'READY' && auth.hasPermission('sales:create') ? (
                    <Link href={`${base}/sales/new?fromOrder=${orderId}`}>
                      <Button type="button">Оформить продажу</Button>
                    </Link>
                  ) : null}
                  {draft && auth.hasPermission('orders:confirm') ? (
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(() => client.confirmOrder(organizationId, storeId, orderId))
                      }
                    >
                      Подтвердить
                    </Button>
                  ) : null}
                  {(order.status === 'CONFIRMED' ||
                    order.status === 'PARTIALLY_RESERVED' ||
                    order.status === 'RESERVED') &&
                  auth.hasPermission('orders:reserve') ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        void run(() => client.reserveOrder(organizationId, storeId, orderId))
                      }
                    >
                      Резервировать
                    </Button>
                  ) : null}
                  {(order.status === 'RESERVED' || order.status === 'PARTIALLY_RESERVED') &&
                  auth.hasPermission('orders:prepare') ? (
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          client.startOrderPreparation(organizationId, storeId, orderId),
                        )
                      }
                    >
                      В работу
                    </Button>
                  ) : null}
                  {inPrep && auth.hasPermission('orders:prepare') ? (
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(() => client.markOrderReady(organizationId, storeId, orderId))
                      }
                    >
                      Готов
                    </Button>
                  ) : null}
                  {order.status === 'READY' && auth.hasPermission('orders:prepare') ? (
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(() => client.completeOrder(organizationId, storeId, orderId))
                      }
                    >
                      Завершить
                    </Button>
                  ) : null}
                  {order.status !== 'COMPLETED' &&
                  order.status !== 'CANCELLED' &&
                  auth.hasPermission('orders:cancel') ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        void run(() => client.cancelOrder(organizationId, storeId, orderId))
                      }
                    >
                      Отменить
                    </Button>
                  ) : null}
                </div>
              </Card>
            </Section>

            <Section>
              <Card title="Таймлайн">
                <ul className="list-stack">
                  {(order.timeline ?? []).map((event) => (
                    <li key={event.id}>
                      <div className="meta-row">
                        <StatusBadge status={event.type} />
                        <span>{new Date(event.occurredAt).toLocaleString()}</span>
                      </div>
                      {event.message ? <p style={{ margin: '4px 0 0' }}>{event.message}</p> : null}
                    </li>
                  ))}
                </ul>
              </Card>
            </Section>

            <Section>
              <Card title="Комментарии">
                <ul className="list-stack">
                  {(order.comments ?? []).map((c) => (
                    <li key={c.id}>
                      <div className="meta-row">
                        <span>{new Date(c.createdAt).toLocaleString()}</span>
                        <span style={{ color: 'var(--color-muted)', fontSize: 'var(--text-sm)' }}>
                          {c.authorMembershipId.slice(0, 8)}…
                        </span>
                      </div>
                      <p style={{ margin: '4px 0 0' }}>{c.message}</p>
                    </li>
                  ))}
                </ul>
                {auth.hasPermission('orders:update') ? (
                  <form onSubmit={onAddComment} className="stack-form" style={{ marginTop: 16 }}>
                    <Input
                      value={commentMessage}
                      onChange={(e) => setCommentMessage(e.target.value)}
                      placeholder="Новый комментарий"
                    />
                    <Button type="submit" disabled={busy || !commentMessage.trim()}>
                      Добавить
                    </Button>
                  </form>
                ) : null}
              </Card>
            </Section>
          </>
        ) : null}
      </PageContainer>
    </main>
  );
}
