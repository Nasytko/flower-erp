'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { ApiClientError, type DeliveryJobDto } from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { AutoNumberNote, Field } from '@/components/layout/field';
import { FancySelect } from '@/components/layout/fancy-select';
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
import { deliveryStatusLabel } from '@/lib/delivery-labels';

type OrderDetail = Awaited<ReturnType<ReturnType<typeof getApiClient>['getOrder']>>;
type PaymentSummary = Awaited<ReturnType<ReturnType<typeof getApiClient>['getOrderPaymentSummary']>>;
type PaymentMethod = Awaited<
  ReturnType<ReturnType<typeof getApiClient>['listPaymentMethods']>
>[number];

type LifecycleStep = 'DRAFT' | 'ASSEMBLING' | 'READY' | 'IN_DELIVERY' | 'DONE';

function newIdempotencyKey(prefix = 'ord') {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

const LIFECYCLE_LABELS: Record<LifecycleStep, string> = {
  DRAFT: 'Черновик',
  ASSEMBLING: 'Собирается',
  READY: 'Готов',
  IN_DELIVERY: 'В доставке',
  DONE: 'Готово',
};

function resolveLifecycle(
  order: OrderDetail,
  delivery: DeliveryJobDto | null,
): LifecycleStep {
  if (order.status === 'CANCELLED') return 'DRAFT';
  if (order.status === 'COMPLETED' || delivery?.status === 'DELIVERED') return 'DONE';
  if (
    delivery &&
    (delivery.status === 'IN_TRANSIT' ||
      delivery.handedOverAt ||
      delivery.status === 'READY_FOR_DISPATCH')
  ) {
    if (delivery.status === 'IN_TRANSIT' || delivery.handedOverAt) return 'IN_DELIVERY';
  }
  if (order.status === 'READY') return 'READY';
  if (order.status === 'DRAFT') return 'DRAFT';
  return 'ASSEMBLING';
}

export default function OrderDetailPage() {
  const params = useParams<{ organizationId: string; storeId: string; orderId: string }>();
  const auth = useAuth();
  const { organizationId, storeId, orderId } = params;
  const base = `/organizations/${organizationId}/stores/${storeId}`;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [delivery, setDelivery] = useState<DeliveryJobDto | null>(null);
  const [items, setItems] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [itemId, setItemId] = useState('');
  const [plannedQuantity, setPlannedQuantity] = useState('1');
  const [actualItemId, setActualItemId] = useState('');
  const [actualQuantity, setActualQuantity] = useState('1');
  const [commentMessage, setCommentMessage] = useState('');
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [paymentLines, setPaymentLines] = useState<PaymentSplitLine[]>([createEmptyPaymentLine()]);
  const [editType, setEditType] = useState<'PICKUP' | 'DELIVERY'>('PICKUP');
  const [editAddress, setEditAddress] = useState('');
  const [editCity, setEditCity] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canReadPayments = auth.hasPermission('payments:read');
  const canReadDelivery = auth.hasPermission('delivery:read');
  const canAudit = auth.hasPermission('audit:read');

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
      setEditType(detail.type === 'DELIVERY' ? 'DELIVERY' : 'PICKUP');
      setItems(catalog.items);
      setPaymentSummary(summary);
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

      const linked = deliveries.find(
        (d) => d.orderId === orderId && d.status !== 'CANCELLED',
      );
      if (linked) {
        const full = await client.getDelivery(organizationId, storeId, linked.id);
        setDelivery(full);
        setEditAddress(full.addressLine || '');
        setEditCity(full.city || '');
      } else {
        setDelivery(null);
        setEditAddress('');
        setEditCity('');
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
            newIdempotencyKey('pay'),
          );
        }
      }
      setPaymentLines([createEmptyPaymentLine(paymentMethods[0]?.id ?? '')]);
    });
  }

  async function handOverToDelivery() {
    if (!delivery) return;
    await run(async () => {
      const client = getApiClient();
      let job = delivery;
      if (job.status === 'DRAFT') {
        job = await client.planDelivery(organizationId, storeId, job.id, {
          expectedVersion: job.version,
        });
      }
      if (job.status === 'PLANNED' || job.status === 'ASSIGNED') {
        job = await client.markDeliveryReadyForDispatch(organizationId, storeId, job.id, {
          expectedVersion: job.version,
        });
      }
      if (!job.handedOverAt) {
        job = await client.handoverDelivery(organizationId, storeId, job.id, {
          expectedVersion: job.version,
        });
      }
      if (job.status !== 'IN_TRANSIT' && job.status !== 'DELIVERED') {
        await client.startDeliveryTransit(organizationId, storeId, job.id, {
          expectedVersion: job.version,
        });
      }
    });
  }

  async function markDelivered() {
    if (!delivery) return;
    await run(async () => {
      const client = getApiClient();
      let job = delivery;
      if (job.status !== 'IN_TRANSIT' && job.status !== 'DELIVERED') {
        if (job.status === 'DRAFT') {
          job = await client.planDelivery(organizationId, storeId, job.id, {
            expectedVersion: job.version,
          });
        }
        if (job.status === 'PLANNED' || job.status === 'ASSIGNED') {
          job = await client.markDeliveryReadyForDispatch(organizationId, storeId, job.id, {
            expectedVersion: job.version,
          });
        }
        if (!job.handedOverAt) {
          job = await client.handoverDelivery(organizationId, storeId, job.id, {
            expectedVersion: job.version,
          });
        }
        if (job.status !== 'IN_TRANSIT') {
          job = await client.startDeliveryTransit(organizationId, storeId, job.id, {
            expectedVersion: job.version,
          });
        }
      }
      await client.markDeliveryDelivered(
        organizationId,
        storeId,
        job.id,
        { expectedVersion: job.version },
        { idempotencyKey: newIdempotencyKey('deliver') },
      );
    });
  }

  async function startAssembling() {
    await run(async () => {
      const client = getApiClient();
      const status = order?.status;
      if (status === 'DRAFT') {
        await client.confirmOrder(organizationId, storeId, orderId);
      }
      let fresh = await client.getOrder(organizationId, storeId, orderId);
      if (
        fresh.status === 'CONFIRMED' ||
        fresh.status === 'PARTIALLY_RESERVED' ||
        fresh.status === 'RESERVED'
      ) {
        if (auth.hasPermission('orders:reserve') && fresh.status === 'CONFIRMED') {
          await client.reserveOrder(organizationId, storeId, orderId);
          fresh = await client.getOrder(organizationId, storeId, orderId);
        }
      }

      if (
        !fresh.activeAssignment &&
        auth.hasPermission('orders:assign') &&
        fresh.status !== 'DRAFT' &&
        fresh.status !== 'COMPLETED' &&
        fresh.status !== 'CANCELLED'
      ) {
        const users = await client.listUsers(organizationId);
        const me = users.find((u) => u.login === auth.user?.login);
        if (!me?.membershipId) {
          throw new ApiClientError({
            message: 'Не найден участник текущего пользователя',
            code: 'NOT_FOUND',
            status: 404,
            requestId: 'local',
          });
        }
        await client.assignFlorist(organizationId, storeId, orderId, {
          membershipId: me.membershipId,
        });
        fresh = await client.getOrder(organizationId, storeId, orderId);
      }

      if (
        (fresh.status === 'RESERVED' || fresh.status === 'PARTIALLY_RESERVED') &&
        auth.hasPermission('orders:prepare')
      ) {
        await client.startOrderPreparation(organizationId, storeId, orderId);
      }
    });
  }

  const lifecycle = useMemo(
    () => (order ? resolveLifecycle(order, delivery) : null),
    [order, delivery],
  );

  const lifecycleSteps: LifecycleStep[] =
    order?.type === 'DELIVERY'
      ? ['DRAFT', 'ASSEMBLING', 'READY', 'IN_DELIVERY', 'DONE']
      : ['DRAFT', 'ASSEMBLING', 'READY', 'DONE'];

  if (!auth.hasPermission('orders:read')) {
    return <p className="page-state">Доступ запрещён</p>;
  }

  const client = getApiClient();
  const draft = order?.status === 'DRAFT';
  const inPrep = order?.status === 'IN_PREPARATION';
  const currentStepIdx = lifecycle ? lifecycleSteps.indexOf(lifecycle) : -1;

  return (
    <main>
      <PageContainer>
        <PageHeader
          title={order ? `Заказ ${order.number}` : 'Заказ'}
          description="Кто, когда, состав. Адрес доставки берётся из заказа. Курьера не назначаем — только статусы."
          breadcrumbs={[
            { label: 'Магазин', href: base },
            { label: 'Заказы', href: `${base}/orders` },
            { label: order?.number ?? 'Карточка' },
          ]}
          actions={
            <div className="page-header__actions">
              {order ? <StatusBadge status={order.status} /> : null}
              {canAudit ? (
                <Link href={`/organizations/${organizationId}/audit`}>
                  <Button type="button" variant="ghost">
                    Аудит
                  </Button>
                </Link>
              ) : null}
            </div>
          }
        />

        {loading ? <LoadingState /> : null}
        {error ? <ErrorState message={error} /> : null}

        {order ? (
          <>
            <div className="order-lifecycle" aria-label="Этапы заказа">
              {lifecycleSteps.map((step, idx) => {
                const reached = order.status !== 'CANCELLED' && currentStepIdx >= idx;
                const isCurrent = lifecycle === step;
                return (
                  <div
                    key={step}
                    className={`order-lifecycle__step${reached ? ' order-lifecycle__step--done' : ''}${isCurrent ? ' order-lifecycle__step--current' : ''}`}
                  >
                    <span className="order-lifecycle__dot" />
                    <span className="order-lifecycle__label">
                      {step === 'DONE'
                        ? order.type === 'DELIVERY'
                          ? 'Доставили'
                          : 'Выдан'
                        : LIFECYCLE_LABELS[step]}
                    </span>
                  </div>
                );
              })}
              {order.status === 'CANCELLED' ? <StatusBadge status="CANCELLED" /> : null}
            </div>

            <Section>
              <Card title="Что делать дальше">
                <div className="order-next-actions">
                  {draft && auth.hasPermission('orders:confirm') ? (
                    <Button type="button" disabled={busy} onClick={() => void startAssembling()}>
                      Подтвердить и начать сборку
                    </Button>
                  ) : null}
                  {!draft &&
                  !inPrep &&
                  order.status !== 'READY' &&
                  order.status !== 'COMPLETED' &&
                  order.status !== 'CANCELLED' &&
                  auth.hasPermission('orders:prepare') ? (
                    <Button type="button" disabled={busy} onClick={() => void startAssembling()}>
                      Взять в сборку
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
                      Букет готов
                    </Button>
                  ) : null}
                  {order.status === 'READY' &&
                  order.type === 'DELIVERY' &&
                  delivery &&
                  delivery.status !== 'IN_TRANSIT' &&
                  delivery.status !== 'DELIVERED' &&
                  auth.hasPermission('delivery:dispatch') ? (
                    <Button type="button" disabled={busy} onClick={() => void handOverToDelivery()}>
                      Передали в доставку
                    </Button>
                  ) : null}
                  {order.type === 'DELIVERY' &&
                  delivery &&
                  delivery.status === 'IN_TRANSIT' &&
                  auth.hasPermission('delivery:complete') ? (
                    <Button type="button" disabled={busy} onClick={() => void markDelivered()}>
                      Доставили
                    </Button>
                  ) : null}
                  {order.status === 'READY' && auth.hasPermission('sales:create') ? (
                    <Link href={`${base}/sales/new?fromOrder=${orderId}`}>
                      <Button type="button">Оформить продажу</Button>
                    </Link>
                  ) : null}
                  {order.status === 'READY' &&
                  order.type === 'PICKUP' &&
                  auth.hasPermission('orders:prepare') ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        void run(() => client.completeOrder(organizationId, storeId, orderId))
                      }
                    >
                      Выдали клиенту
                    </Button>
                  ) : null}
                  {order.status !== 'COMPLETED' &&
                  order.status !== 'CANCELLED' &&
                  auth.hasPermission('orders:cancel') ? (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        void run(() => client.cancelOrder(organizationId, storeId, orderId))
                      }
                    >
                      Отменить заказ
                    </Button>
                  ) : null}
                  {auth.hasPermission('orders:assign') &&
                  !order.activeAssignment &&
                  order.status !== 'DRAFT' &&
                  order.status !== 'COMPLETED' &&
                  order.status !== 'CANCELLED' ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const users = await client.listUsers(organizationId);
                          const me = users.find((u) => u.login === auth.user?.login);
                          if (!me?.membershipId) {
                            throw new ApiClientError({
                              message: 'Не найден участник текущего пользователя',
                              code: 'NOT_FOUND',
                              status: 404,
                              requestId: 'local',
                            });
                          }
                          await client.assignFlorist(organizationId, storeId, orderId, {
                            membershipId: me.membershipId,
                          });
                        })
                      }
                    >
                      Назначить себе
                    </Button>
                  ) : null}
                </div>
                {order.activeAssignment ? (
                  <p className="field__hint" style={{ marginTop: 12 }}>
                    Флорист назначен · с{' '}
                    {new Date(order.activeAssignment.assignedAt).toLocaleString('ru-RU')}
                  </p>
                ) : null}
              </Card>
            </Section>

            <Section>
              <Card title="Клиент и срок">
                <AutoNumberNote label="Номер заказа" value={order.number} />
                {draft && auth.hasPermission('orders:update') ? (
                  <form
                    className="stack-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      const nextType = editType;
                      if (nextType === 'DELIVERY' && !editAddress.trim()) {
                        setError('Для доставки укажите адрес');
                        return;
                      }
                      void run(() =>
                        client.updateOrder(organizationId, storeId, orderId, {
                          recipientName: String(form.get('recipientName') || '') || null,
                          recipientPhone: String(form.get('recipientPhone') || '') || null,
                          comment: String(form.get('comment') || '') || null,
                          readyAt: String(form.get('readyAt') || '') || null,
                          type: nextType,
                          plannedPrice: String(form.get('plannedPrice') || '') || null,
                          deliveryAddressLine:
                            nextType === 'DELIVERY' ? editAddress.trim() : null,
                          deliveryCity:
                            nextType === 'DELIVERY' ? editCity.trim() || null : null,
                        }),
                      );
                    }}
                  >
                    <Field label="Способ получения" required>
                      <select
                        className="field-control"
                        value={editType}
                        onChange={(e) =>
                          setEditType(e.target.value === 'DELIVERY' ? 'DELIVERY' : 'PICKUP')
                        }
                      >
                        <option value="PICKUP">Самовывоз</option>
                        <option value="DELIVERY">Доставка</option>
                      </select>
                    </Field>
                    <Field label="Получатель">
                      <Input name="recipientName" defaultValue={order.recipientName ?? ''} />
                    </Field>
                    <Field label="Телефон">
                      <Input
                        name="recipientPhone"
                        defaultValue={order.recipientPhone ?? ''}
                        inputMode="tel"
                      />
                    </Field>
                    <Field
                      label={editType === 'DELIVERY' ? 'Время доставки' : 'Время готовности'}
                    >
                      <Input
                        name="readyAt"
                        type="datetime-local"
                        defaultValue={
                          order.readyAt
                            ? new Date(order.readyAt).toISOString().slice(0, 16)
                            : ''
                        }
                      />
                    </Field>
                    {editType === 'DELIVERY' ? (
                      <>
                        <Field label="Адрес доставки" required>
                          <Input
                            value={editAddress}
                            onChange={(e) => setEditAddress(e.target.value)}
                            placeholder="ул. Независимости, 10, кв. 5"
                            required
                          />
                        </Field>
                        <Field label="Город">
                          <Input
                            value={editCity}
                            onChange={(e) => setEditCity(e.target.value)}
                            placeholder="Как у магазина"
                          />
                        </Field>
                      </>
                    ) : null}
                    <Field label="Плановая цена, BYN">
                      <Input
                        name="plannedPrice"
                        defaultValue={order.plannedPrice ?? ''}
                        inputMode="decimal"
                      />
                    </Field>
                    <Field label="Комментарий">
                      <Input name="comment" defaultValue={order.comment ?? ''} />
                    </Field>
                    <Button type="submit" disabled={busy}>
                      Сохранить
                    </Button>
                  </form>
                ) : (
                  <div className="order-facts">
                    <div>
                      <span className="order-facts__label">Получение</span>
                      <strong>{statusLabelRu(order.type)}</strong>
                    </div>
                    <div>
                      <span className="order-facts__label">Получатель</span>
                      <strong>{order.recipientName ?? '—'}</strong>
                    </div>
                    <div>
                      <span className="order-facts__label">Телефон</span>
                      <strong>{order.recipientPhone ?? '—'}</strong>
                    </div>
                    <div>
                      <span className="order-facts__label">Срок</span>
                      <strong>
                        {order.readyAt
                          ? new Date(order.readyAt).toLocaleString('ru-RU')
                          : 'не указан'}
                      </strong>
                    </div>
                    {order.plannedPrice ? (
                      <div>
                        <span className="order-facts__label">Цена</span>
                        <strong>{order.plannedPrice} BYN</strong>
                      </div>
                    ) : null}
                    {order.comment ? (
                      <div className="order-facts__wide">
                        <span className="order-facts__label">Комментарий</span>
                        <strong>{order.comment}</strong>
                      </div>
                    ) : null}
                  </div>
                )}
              </Card>
            </Section>

            {order.type === 'DELIVERY' ? (
              <Section>
                <Card title="Доставка">
                  {delivery ? (
                    <div className="stack-form">
                      <div className="meta-row">
                        <StatusBadge status={delivery.status} />
                        <span>{deliveryStatusLabel(delivery.status)}</span>
                      </div>
                      <p className="order-address">
                        <strong>{delivery.displayAddress || delivery.addressLine}</strong>
                      </p>
                      <p className="field__hint" style={{ margin: 0 }}>
                        Адрес задан при создании заказа. Курьера не назначаем — только статусы
                        «передали» / «доставили».
                      </p>
                      {auth.hasPermission('delivery:update') &&
                      !['DELIVERED', 'CANCELLED', 'IN_TRANSIT'].includes(delivery.status) ? (
                        <form
                          className="stack-form"
                          onSubmit={(event) => {
                            event.preventDefault();
                            const form = new FormData(event.currentTarget);
                            void run(() =>
                              getApiClient().updateDeliveryAddress(
                                organizationId,
                                storeId,
                                delivery.id,
                                {
                                  expectedVersion: delivery.version,
                                  addressLine: String(form.get('addressLine') || ''),
                                  city: String(form.get('city') || ''),
                                  recipientName:
                                    String(form.get('recipientName') || '') || undefined,
                                  recipientPhone:
                                    String(form.get('recipientPhone') || '') || undefined,
                                },
                              ),
                            );
                          }}
                        >
                          <Field label="Адрес">
                            <Input
                              name="addressLine"
                              defaultValue={delivery.addressLine}
                              required
                            />
                          </Field>
                          <Field label="Город">
                            <Input name="city" defaultValue={delivery.city} required />
                          </Field>
                          <Field label="Получатель">
                            <Input
                              name="recipientName"
                              defaultValue={delivery.recipientName}
                            />
                          </Field>
                          <Field label="Телефон">
                            <Input
                              name="recipientPhone"
                              defaultValue={delivery.recipientPhone}
                            />
                          </Field>
                          <Button type="submit" variant="secondary" disabled={busy}>
                            Обновить адрес
                          </Button>
                        </form>
                      ) : null}
                      <Link href={`${base}/deliveries/${delivery.id}`}>
                        <Button type="button" variant="ghost">
                          Открыть карточку доставки
                        </Button>
                      </Link>
                    </div>
                  ) : (
                    <p className="field__hint">
                      {draft
                        ? 'Выберите «Доставка», укажите адрес и город выше, затем «Сохранить» — доставка создастся.'
                        : 'Доставка ещё не создана. Вернитесь в черновик или укажите адрес при создании заказа.'}
                    </p>
                  )}
                </Card>
              </Section>
            ) : null}

            <Section>
              <Card title="Состав">
                <ul className="list-stack">
                  {(order.composition?.items ?? []).map((line) => (
                    <li key={line.id}>
                      <div className="meta-row">
                        <strong>
                          {line.item?.name ?? line.itemId} × {line.plannedQuantity}
                        </strong>
                        {line.deficitQuantity && line.deficitQuantity !== '0' ? (
                          <StatusBadge status="DEFICIT" />
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
                {(order.composition?.items ?? []).length === 0 ? (
                  <p className="field__hint">Добавьте позиции для сборки.</p>
                ) : null}
                {draft && auth.hasPermission('orders:update') ? (
                  <form
                    onSubmit={onAddCompositionItem}
                    className="stack-form"
                    style={{ marginTop: 16 }}
                  >
                    <FancySelect
                      value={itemId}
                      onChange={setItemId}
                      options={items.map((item) => ({
                        value: item.id,
                        label: item.name,
                        hint: item.code,
                      }))}
                      aria-label="Товар"
                    />
                    <Input
                      value={plannedQuantity}
                      onChange={(e) => setPlannedQuantity(e.target.value)}
                      placeholder="Количество"
                      inputMode="decimal"
                    />
                    <Button type="submit" disabled={busy || !itemId}>
                      Добавить
                    </Button>
                  </form>
                ) : null}

                {inPrep || order.actualComposition ? (
                  <div style={{ marginTop: 20 }}>
                    <h3 className="order-subheading">Факт при сборке</h3>
                    <ul className="list-stack">
                      {(order.actualComposition?.items ?? []).map((line) => (
                        <li key={line.id}>
                          <strong>
                            {line.item?.name ?? line.itemId} × {line.actualQuantity}
                          </strong>
                        </li>
                      ))}
                    </ul>
                    {inPrep &&
                    !order.actualComposition?.frozenAt &&
                    auth.hasPermission('orders:prepare') ? (
                      <form
                        onSubmit={onSetActualFromForm}
                        className="stack-form"
                        style={{ marginTop: 12 }}
                      >
                        <FancySelect
                          value={actualItemId}
                          onChange={setActualItemId}
                          options={items.map((item) => ({
                            value: item.id,
                            label: item.name,
                            hint: item.code,
                          }))}
                          aria-label="Факт товар"
                        />
                        <Input
                          value={actualQuantity}
                          onChange={(e) => setActualQuantity(e.target.value)}
                          placeholder="Факт. количество"
                          inputMode="decimal"
                        />
                        <Button type="submit" disabled={busy || !actualItemId}>
                          Сохранить факт
                        </Button>
                      </form>
                    ) : null}
                  </div>
                ) : null}
              </Card>
            </Section>

            {canReadPayments ? (
              <Section>
                <Card title="Оплата">
                  {paymentSummary ? (
                    <div className="meta-row">
                      <StatusBadge status={paymentSummary.status} />
                      <span>Итого: {paymentSummary.totalAmount}</span>
                      <span>Оплачено: {paymentSummary.paidAmount}</span>
                      <span>К доплате: {paymentSummary.balanceDue}</span>
                    </div>
                  ) : null}
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
                        label="Предоплата"
                      />
                      <Button
                        type="submit"
                        disabled={busy || parsePaymentSplit(paymentLines).length === 0}
                      >
                        Зафиксировать оплату
                      </Button>
                    </form>
                  ) : null}
                </Card>
              </Section>
            ) : null}

            <Section>
              <Card title="Заметки">
                <ul className="list-stack">
                  {(order.comments ?? []).map((c) => (
                    <li key={c.id}>
                      <div className="meta-row">
                        <span>{new Date(c.createdAt).toLocaleString('ru-RU')}</span>
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
                      placeholder="Короткая заметка для команды"
                    />
                    <Button type="submit" disabled={busy || !commentMessage.trim()}>
                      Добавить
                    </Button>
                  </form>
                ) : null}
                {canAudit ? (
                  <p className="field__hint" style={{ marginTop: 16 }}>
                    История действий пользователей — в{' '}
                    <Link href={`/organizations/${organizationId}/audit`}>журнале аудита</Link>.
                  </p>
                ) : (
                  <p className="field__hint" style={{ marginTop: 16 }}>
                    История действий хранится в журнале аудита системы.
                  </p>
                )}
              </Card>
            </Section>
          </>
        ) : null}
      </PageContainer>
    </main>
  );
}
