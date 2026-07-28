'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { ApiClientError, type AuditLogEntry, type DeliveryJobDto } from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { EntityAuditHistory } from '@/components/audit/entity-audit-history';
import { useAuth } from '@/components/auth-provider';
import { Field } from '@/components/layout/field';
import { AddressAutocomplete } from '@/components/layout/address-autocomplete';
import { ReadyAtField } from '@/components/layout/ready-at-field';
import { parseBynToApi } from '@/components/layout/money-byn-input';
import {
  type FieldErrors,
  firstFieldError,
  hasFieldErrors,
  requiredText,
} from '@/lib/form-validation';
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
import { InlineAlert } from '@/components/workspace/workspace-ui';
import { StatusBadge } from '@/components/layout/status-badge';
import { deliveryStatusLabel } from '@/lib/delivery-labels';
import { newIdempotencyKey } from '@/lib/idempotency';
import {
  combineDateAndTime,
  isOrderHeaderEditable,
  orderLifecycleSteps,
  orderPhaseLabel,
  resolveOrderPhase,
  splitReadyAt,
  type OrderPhase,
} from '@/lib/order-ui';
import { statusLabelRu } from '@/lib/status-labels-ru';

type OrderDetail = Awaited<ReturnType<ReturnType<typeof getApiClient>['getOrder']>>;
type PaymentSummary = Awaited<ReturnType<ReturnType<typeof getApiClient>['getOrderPaymentSummary']>>;
type PaymentMethod = Awaited<
  ReturnType<ReturnType<typeof getApiClient>['listPaymentMethods']>
>[number];

const PHASE_TONE: Record<OrderPhase, string> = {
  NEW: 'warning',
  IN_WORK: 'info',
  READY: 'success',
  HANDED_OFF: 'success',
};

function OrderPhaseBadge({
  phase,
  orderType,
}: {
  phase: OrderPhase;
  orderType?: string;
}) {
  return (
    <span className={`status-badge status-badge--${PHASE_TONE[phase]}`}>
      {orderPhaseLabel(phase, { type: orderType })}
    </span>
  );
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
  const [commentMessage, setCommentMessage] = useState('');
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [paymentLines, setPaymentLines] = useState<PaymentSplitLine[]>([createEmptyPaymentLine()]);
  const [editType, setEditType] = useState<'PICKUP' | 'DELIVERY'>('PICKUP');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('12:00');
  const [editAddress, setEditAddress] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editApartment, setEditApartment] = useState('');
  const [editDeliveryComment, setEditDeliveryComment] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [auditTrail, setAuditTrail] = useState<AuditLogEntry[]>([]);

  const canReadPayments = auth.hasPermission('payments:read');
  const canReadDelivery = auth.hasPermission('delivery:read');

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const client = getApiClient();
      const [detail, catalog, methods, deliveries, history] = await Promise.all([
        client.getOrder(organizationId, storeId, orderId),
        client.listItems(organizationId, { pageSize: 100, status: 'ACTIVE' }),
        canReadPayments &&
        (auth.hasPermission('payments:create') || auth.hasPermission('payments:complete'))
          ? client.listPaymentMethods(organizationId, storeId, { activeOnly: true })
          : Promise.resolve([] as PaymentMethod[]),
        canReadDelivery
          ? client.listDeliveries(organizationId, storeId)
          : Promise.resolve([]),
        client.listOrderAuditTrail(organizationId, storeId, orderId).catch(() => []),
      ]);
      setOrder(detail);
      setAuditTrail(history);
      setEditType(detail.type === 'DELIVERY' ? 'DELIVERY' : 'PICKUP');
      const { date, time } = splitReadyAt(detail.readyAt);
      setEditDate(date);
      setEditTime(time);
      setItems(catalog.items);
      setPaymentMethods(methods);
      if (canReadPayments) {
        try {
          const summary = await client.getOrderPaymentSummary(organizationId, storeId, orderId);
          setPaymentSummary(summary);
        } catch {
          setPaymentSummary(null);
        }
      } else {
        setPaymentSummary(null);
      }
      if (methods[0]) {
        setPaymentLines((prev) =>
          prev.length === 1 && !prev[0]!.methodId && !prev[0]!.amount
            ? [createEmptyPaymentLine(methods[0]!.id)]
            : prev,
        );
      }
      if (catalog.items[0]) {
        setItemId((prev) => prev || catalog.items[0]!.id);
      }

      const linked = deliveries.find(
        (d) => d.orderId === orderId && d.status !== 'CANCELLED',
      );
      if (linked) {
        const full = await client.getDelivery(organizationId, storeId, linked.id);
        setDelivery(full);
        setEditAddress(full.addressLine || '');
        setEditCity(full.city || '');
        setEditApartment(full.apartment || '');
        setEditDeliveryComment(full.deliveryComment || '');
      } else {
        setDelivery(null);
        setEditAddress('');
        setEditCity('');
        setEditApartment('');
        setEditDeliveryComment('');
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

  async function finishDelivery() {
    if (!delivery) return;
    await run(async () => {
      const client = getApiClient();
      let job = delivery;
      if (job.status !== 'IN_TRANSIT' && job.status !== 'DELIVERED') {
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
      const fresh = await client.getOrder(organizationId, storeId, orderId);
      if (fresh.status === 'READY') {
        await client.completeOrder(organizationId, storeId, orderId);
      }
    });
  }

  const phase = useMemo(
    () =>
      order
        ? resolveOrderPhase(
            {
              status: order.status,
              type: order.type,
              displayPhase: order.displayPhase,
              displayPhaseLabel: order.displayPhaseLabel,
              hasActiveAssignment: Boolean(order.assignedFloristId),
            },
            delivery,
          )
        : null,
    [order, delivery],
  );

  const lifecycleSteps = orderLifecycleSteps();
  const currentStepIdx =
    phase && order?.status !== 'CANCELLED' ? lifecycleSteps.indexOf(phase) : -1;

  if (!auth.hasPermission('orders:read')) {
    return <p className="page-state">Доступ запрещён</p>;
  }

  const client = getApiClient();
  const editable = order ? isOrderHeaderEditable(order.status) : false;
  const canUpdate = editable && auth.hasPermission('orders:update');
  const needsReserve =
    order?.status === 'CONFIRMED' ||
    (order?.status === 'PARTIALLY_RESERVED' && Boolean(order.hasDeficit));
  const canReserve = needsReserve && auth.hasPermission('orders:reserve');
  const deliveryInTransit =
    delivery?.status === 'IN_TRANSIT' || Boolean(delivery?.handedOverAt);

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Заказ"
          refCode={order?.number}
          breadcrumbs={[
            { label: 'Магазин', href: base },
            { label: 'Заказы', href: `${base}/orders` },
            { label: order?.recipientName?.trim() || 'Карточка' },
          ]}
          actions={
            phase && order ? (
              <OrderPhaseBadge phase={phase} orderType={order.type} />
            ) : null
          }
        />

        {loading ? <LoadingState /> : null}
        {error ? <ErrorState message={error} /> : null}

        {order ? (
          <>
            <div className="order-lifecycle" aria-label="Этапы заказа">
              {lifecycleSteps.map((step, idx) => {
                const reached = order.status !== 'CANCELLED' && currentStepIdx >= idx;
                const isCurrent = phase === step;
                return (
                  <div
                    key={step}
                    className={`order-lifecycle__step${reached ? ' order-lifecycle__step--done' : ''}${isCurrent ? ' order-lifecycle__step--current' : ''}`}
                  >
                    <span className="order-lifecycle__dot" />
                    <span className="order-lifecycle__label">
                      {order ? orderPhaseLabel(step, order) : orderPhaseLabel(step)}
                    </span>
                  </div>
                );
              })}
              {order.status === 'CANCELLED' ? <StatusBadge status="CANCELLED" /> : null}
            </div>

            <Section>
              <Card title="Действия">
                {(order.status === 'CONFIRMED' || order.status === 'PARTIALLY_RESERVED') &&
                order.hasDeficit ? (
                  <InlineAlert tone="warning" title="Не хватает на складе">
                    Резерв неполный. Повторите резерв после поступления или замените позиции в рабочем
                    заказе.
                  </InlineAlert>
                ) : null}
                <div className="order-next-actions">
                  {canReserve ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        void run(() => client.reserveOrder(organizationId, storeId, orderId))
                      }
                    >
                      Повторить резерв
                    </Button>
                  ) : null}
                  {phase === 'NEW' &&
                  order.status !== 'CANCELLED' &&
                  auth.hasPermission('orders:prepare') ? (
                    <Link href={`${base}/work-orders/${orderId}`}>
                      <Button type="button">Взять в работу</Button>
                    </Link>
                  ) : null}
                  {phase === 'IN_WORK' &&
                  order.status === 'IN_PREPARATION' &&
                  auth.hasPermission('orders:prepare') ? (
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
                  {phase === 'READY' &&
                  order.type === 'DELIVERY' &&
                  delivery &&
                  !deliveryInTransit &&
                  auth.hasPermission('delivery:dispatch') ? (
                    <Button type="button" disabled={busy} onClick={() => void handOverToDelivery()}>
                      Передан в доставку
                    </Button>
                  ) : null}
                  {phase === 'READY' &&
                  order.type === 'DELIVERY' &&
                  delivery &&
                  deliveryInTransit &&
                  auth.hasPermission('delivery:complete') ? (
                    <Button type="button" disabled={busy} onClick={() => void finishDelivery()}>
                      Передан (доставка)
                    </Button>
                  ) : null}
                  {phase === 'READY' &&
                  order.type === 'PICKUP' &&
                  auth.hasPermission('orders:prepare') ? (
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(() => client.completeOrder(organizationId, storeId, orderId))
                      }
                    >
                      Передан (самовывоз)
                    </Button>
                  ) : null}
                  {phase === 'READY' && auth.hasPermission('sales:create') ? (
                    <Link href={`${base}/sales/new?fromOrder=${orderId}`}>
                      <Button type="button" variant="secondary">
                        Оформить продажу
                      </Button>
                    </Link>
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
                      Отменить
                    </Button>
                  ) : null}
                </div>
              </Card>
            </Section>

            <Section>
              <Card title="Срок">
                {canUpdate ? (
                  <form
                    className="stack-form"
                    noValidate
                    onSubmit={(event) => {
                      event.preventDefault();
                      const errors: FieldErrors = {
                        readyDate: requiredText(editDate, 'Укажите дату'),
                        readyTime: requiredText(editTime, 'Укажите время'),
                      };
                      setFieldErrors(errors);
                      if (hasFieldErrors(errors)) {
                        setError(firstFieldError(errors));
                        return;
                      }
                      void run(() =>
                        client.updateOrder(organizationId, storeId, orderId, {
                          readyAt: combineDateAndTime(editDate, editTime),
                        }),
                      );
                    }}
                  >
                    <ReadyAtField
                      date={editDate}
                      time={editTime}
                      onDateChange={setEditDate}
                      onTimeChange={setEditTime}
                      dateError={fieldErrors.readyDate}
                      timeError={fieldErrors.readyTime}
                      required
                    />
                    <Button type="submit" disabled={busy}>
                      Сохранить срок
                    </Button>
                  </form>
                ) : (
                  <ReadyAtField
                    date={splitReadyAt(order.readyAt).date}
                    time={splitReadyAt(order.readyAt).time}
                    onDateChange={() => {}}
                    onTimeChange={() => {}}
                    disabled
                  />
                )}
              </Card>
            </Section>

            <Section>
              <Card title="Заказ">
                {canUpdate ? (
                  <form
                    className="stack-form"
                    noValidate
                    onSubmit={(event) => {
                      event.preventDefault();
                      const errors: FieldErrors = {
                        recipientName: requiredText(
                          String(
                            (event.currentTarget.elements.namedItem('recipientName') as HTMLInputElement)
                              ?.value || '',
                          ),
                          'Укажите получателя',
                        ),
                      };
                      if (editType === 'DELIVERY') {
                        errors.deliveryAddress = requiredText(editAddress, 'Укажите адрес доставки');
                      }
                      setFieldErrors(errors);
                      if (hasFieldErrors(errors)) {
                        setError(firstFieldError(errors));
                        return;
                      }
                      void run(async () => {
                        const client = getApiClient();
                        const recipientName = String(
                          (event.currentTarget.elements.namedItem('recipientName') as HTMLInputElement)
                            ?.value || '',
                        ).trim();
                        const recipientPhone = String(
                          (event.currentTarget.elements.namedItem('recipientPhone') as HTMLInputElement)
                            ?.value || '',
                        ).trim();
                        const comment = String(
                          (event.currentTarget.elements.namedItem('comment') as HTMLInputElement)
                            ?.value || '',
                        ).trim();
                        const plannedPriceRaw = String(
                          (event.currentTarget.elements.namedItem('plannedPrice') as HTMLInputElement)
                            ?.value || '',
                        );
                        await client.updateOrder(organizationId, storeId, orderId, {
                          recipientName: recipientName || null,
                          recipientPhone: recipientPhone || null,
                          comment: comment || null,
                          type: editType,
                          plannedPrice: parseBynToApi(plannedPriceRaw) ?? (plannedPriceRaw.trim() || null),
                          deliveryAddressLine:
                            editType === 'DELIVERY' ? editAddress.trim() : null,
                          deliveryCity: editType === 'DELIVERY' ? editCity.trim() || null : null,
                          deliveryApartment:
                            editType === 'DELIVERY' ? editApartment.trim() || null : null,
                          deliveryComment:
                            editType === 'DELIVERY' ? editDeliveryComment.trim() || null : null,
                        });
                        if (
                          editType === 'DELIVERY' &&
                          delivery &&
                          auth.hasPermission('delivery:update')
                        ) {
                          await client.updateDeliveryAddress(organizationId, storeId, delivery.id, {
                            expectedVersion: delivery.version,
                            addressLine: editAddress.trim(),
                            city: editCity.trim(),
                            postalCode: delivery.postalCode,
                            entrance: delivery.entrance,
                            floor: delivery.floor,
                            apartment: editApartment.trim() || null,
                            accessCode: delivery.accessCode,
                            deliveryComment: editDeliveryComment.trim() || null,
                            recipientName: recipientName || undefined,
                            recipientPhone: recipientPhone || undefined,
                          });
                        }
                      });
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
                    <Field label="Получатель" required error={fieldErrors.recipientName}>
                      <Input
                        name="recipientName"
                        defaultValue={order.recipientName ?? ''}
                        required
                      />
                    </Field>
                    <Field label="Телефон">
                      <Input
                        name="recipientPhone"
                        defaultValue={order.recipientPhone ?? ''}
                        inputMode="tel"
                      />
                    </Field>
                    {editType === 'DELIVERY' ? (
                      <>
                        <Field label="Адрес доставки" required error={fieldErrors.deliveryAddress}>
                          <AddressAutocomplete
                            organizationId={organizationId}
                            storeId={storeId}
                            value={editAddress}
                            onChange={setEditAddress}
                            onSelect={(hit) => {
                              if (hit.city) setEditCity(hit.city);
                            }}
                            city={editCity || undefined}
                            resetKey={`${orderId}-${delivery?.id ?? 'new'}-${delivery?.version ?? 0}`}
                            required
                          />
                        </Field>
                        <div className="sale-custom-meta">
                          <Field label="Квартира / офис">
                            <Input
                              value={editApartment}
                              onChange={(e) => setEditApartment(e.target.value)}
                              placeholder="12"
                            />
                          </Field>
                          <Field label="Город">
                            <Input
                              value={editCity}
                              onChange={(e) => setEditCity(e.target.value)}
                              placeholder="Как у магазина"
                            />
                          </Field>
                        </div>
                        <Field
                          label="Пометка к адресу"
                          hint="Для курьера: подъезд, домофон, ориентиры"
                        >
                          <Input
                            value={editDeliveryComment}
                            onChange={(e) => setEditDeliveryComment(e.target.value)}
                            placeholder="Подъезд 2, домофон 120"
                          />
                        </Field>
                      </>
                    ) : null}
                    <Field label="Плановая цена">
                      <Input
                        name="plannedPrice"
                        defaultValue={order.plannedPrice ?? ''}
                        inputMode="decimal"
                        placeholder="0.00"
                      />
                    </Field>
                    <Field label="Пометка к заказу">
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
                    {order.plannedPrice ? (
                      <div>
                        <span className="order-facts__label">Цена</span>
                        <strong>{order.plannedPrice} BYN</strong>
                      </div>
                    ) : null}
                    {order.comment ? (
                      <div className="order-facts__wide">
                        <span className="order-facts__label">Пометка</span>
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
                        {phase ? (
                          <OrderPhaseBadge phase={phase} orderType={order.type} />
                        ) : null}
                      </div>
                      <p className="order-address">
                        <strong>{delivery.displayAddress || delivery.addressLine}</strong>
                        {delivery.apartment ? (
                          <span className="field__hint"> · кв. {delivery.apartment}</span>
                        ) : null}
                      </p>
                      {delivery.deliveryComment ? (
                        <p className="field__hint">{delivery.deliveryComment}</p>
                      ) : null}
                      <Link href={`${base}/deliveries/${delivery.id}`}>
                        <Button type="button" variant="ghost">
                          Открыть на доске доставки
                        </Button>
                      </Link>
                    </div>
                  ) : (
                    <p className="field__hint">
                      {canUpdate
                        ? 'Укажите адрес ниже и сохраните — доставка создастся автоматически.'
                        : 'Доставка ещё не создана.'}
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
                  <p className="field__hint">Добавьте позиции перед сборкой.</p>
                ) : null}
                {canUpdate ? (
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
              </Card>
            </Section>

            {canReadPayments ? (
              <Section>
                <Card title="Оплата">
                  {!order.plannedPrice ? (
                    <p className="field__hint">
                      Укажите плановую цену заказа выше — без неё нельзя принять предоплату и
                      посчитать остаток.
                    </p>
                  ) : null}
                  {paymentSummary && order.plannedPrice ? (
                    <div className="meta-row">
                      <StatusBadge status={paymentSummary.status} />
                      <span>Итого: {paymentSummary.totalAmount}</span>
                      <span>Оплачено: {paymentSummary.paidAmount}</span>
                      <span>К доплате: {paymentSummary.balanceDue}</span>
                    </div>
                  ) : null}
                  {auth.hasPermission('payments:create') &&
                  auth.hasPermission('payments:complete') &&
                  order.plannedPrice &&
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
                {(order.comment || (order.comments ?? []).length > 0) ? (
                  <ul className="list-stack">
                    {order.comment ? (
                      <li>
                        <span className="field__hint">Пометка к заказу</span>
                        <p style={{ margin: '4px 0 0' }}>{order.comment}</p>
                      </li>
                    ) : null}
                    {(order.comments ?? []).map((c) => (
                      <li key={c.id}>
                        <div className="meta-row">
                          <span>{new Date(c.createdAt).toLocaleString('ru-RU')}</span>
                        </div>
                        <p style={{ margin: '4px 0 0' }}>{c.message}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="field__hint">Заметок пока нет.</p>
                )}
                {auth.hasPermission('orders:update') ? (
                  <form onSubmit={onAddComment} className="stack-form" style={{ marginTop: 16 }}>
                    <Input
                      value={commentMessage}
                      onChange={(e) => setCommentMessage(e.target.value)}
                      placeholder="Добавить заметку для команды"
                    />
                    <Button type="submit" disabled={busy || !commentMessage.trim()}>
                      Добавить
                    </Button>
                  </form>
                ) : null}
              </Card>
            </Section>

            <Section>
              <EntityAuditHistory entries={auditTrail} />
            </Section>
          </>
        ) : null}
      </PageContainer>
    </main>
  );
}
