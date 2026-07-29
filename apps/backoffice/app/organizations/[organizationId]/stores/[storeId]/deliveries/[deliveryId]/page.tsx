'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import {
  ApiClientError,
  type DeliveryJobDto,
  type DeliverySummaryDto,
} from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { Field } from '@/components/layout/field';
import {
  type FieldErrors,
  firstFieldError,
  hasFieldErrors,
  requiredText,
} from '@/lib/form-validation';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';
import { ConfirmDialog, InlineAlert } from '@/components/workspace/workspace-ui';
import { AddressAutocomplete } from '@/components/layout/address-autocomplete';
import {
  DELIVERY_PROBLEM_TYPES,
  deliveryStatusLabel,
  formatWindow,
  newIdempotencyKey,
} from '@/lib/delivery-labels';
import { OrderJourneyTree } from '@/components/order/order-journey-tree';
import { pickLinkedSale } from '@/lib/order-journey';
import {
  orderPhaseLabel,
  resolveOrderPhase,
  type OrderPhase,
} from '@/lib/order-ui';
import { NavigationButtons } from '@/components/delivery/navigation-buttons';

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

export default function DeliveryDetailPage() {
  const params = useParams<{ organizationId: string; storeId: string; deliveryId: string }>();
  const auth = useAuth();
  const { organizationId, storeId, deliveryId } = params;
  const base = `/organizations/${organizationId}/stores/${storeId}`;

  const [summary, setSummary] = useState<DeliverySummaryDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problemType, setProblemType] = useState<string>(DELIVERY_PROBLEM_TYPES[0]);
  const [problemDescription, setProblemDescription] = useState('');
  const [resolveToStatus, setResolveToStatus] = useState('IN_TRANSIT');
  const [resolution, setResolution] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [editAddressLine, setEditAddressLine] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editApartment, setEditApartment] = useState('');
  const [editDeliveryComment, setEditDeliveryComment] = useState('');
  const [addressErrors, setAddressErrors] = useState<FieldErrors>({});
  const [journeyOrder, setJourneyOrder] = useState<{
    id: string;
    number: string;
    type: string;
    status: string;
    completedAt?: string | null;
  } | null>(null);
  const [linkedSale, setLinkedSale] = useState<{
    id: string;
    number: string;
    status: string;
  } | null>(null);

  const canRead = auth.hasPermission('delivery:read');
  const canReadOrders = auth.hasPermission('orders:read');
  const canReadSales = auth.hasPermission('sales:read');
  const canPayment = auth.hasPermission('delivery:view-payment-summary');
  const canAudit = auth.hasPermission('audit:read');

  const job = summary?.delivery ?? null;
  const openProblems = summary?.openProblems ?? [];

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = getApiClient();
      const sum = await client.getDeliverySummary(organizationId, storeId, deliveryId);
      setSummary(sum);
      setEditAddressLine(sum.delivery.addressLine);
      setEditCity(sum.delivery.city);
      setEditApartment(sum.delivery.apartment ?? '');
      setEditDeliveryComment(sum.delivery.deliveryComment ?? '');
      const orderId = sum.delivery.orderId;
      if (canReadOrders || canReadSales) {
        const [orderDetail, sales] = await Promise.all([
          canReadOrders
            ? client.getOrder(organizationId, storeId, orderId).catch(() => null)
            : Promise.resolve(null),
          canReadSales
            ? client.listSales(organizationId, storeId, { orderId })
            : Promise.resolve([]),
        ]);
        setJourneyOrder(
          orderDetail
            ? {
                id: orderDetail.id,
                number: orderDetail.number,
                type: orderDetail.type,
                status: orderDetail.status,
                completedAt: orderDetail.completedAt,
              }
            : {
                id: orderId,
                number: sum.orderNumber ?? orderId,
                type: 'DELIVERY',
                status: sum.orderStatus ?? 'DRAFT',
              },
        );
        setLinkedSale(pickLinkedSale(sales));
      } else {
        setJourneyOrder(null);
        setLinkedSale(null);
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось загрузить доставку');
    } finally {
      setLoading(false);
    }
  }, [organizationId, storeId, deliveryId, canReadOrders, canReadSales]);

  useEffect(() => {
    if (!canRead) return;
    void load();
  }, [canRead, load]);

  async function run(action: () => Promise<DeliveryJobDto | unknown>) {
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

  function withVersion<T extends { expectedVersion: number }>(
    body: Omit<T, 'expectedVersion'> & { expectedVersion?: number },
  ): T {
    if (!job) throw new Error('No job');
    return { ...body, expectedVersion: job.version } as T;
  }

  async function onUpdateAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!job) return;
    const form = new FormData(event.currentTarget);
    const errors: FieldErrors = {
      addressLine: requiredText(editAddressLine, 'Укажите адрес'),
      city: requiredText(editCity, 'Укажите город'),
      recipientName: requiredText(String(form.get('recipientName') || ''), 'Укажите получателя'),
    };
    setAddressErrors(errors);
    if (hasFieldErrors(errors)) {
      setError(firstFieldError(errors));
      return;
    }
    await run(() =>
      getApiClient().updateDeliveryAddress(
        organizationId,
        storeId,
        deliveryId,
        withVersion({
          addressLine: editAddressLine.trim(),
          city: editCity.trim(),
          postalCode: job.postalCode,
          entrance: job.entrance,
          floor: job.floor,
          apartment: editApartment.trim() || null,
          accessCode: job.accessCode,
          deliveryComment: editDeliveryComment.trim() || null,
          recipientName: String(form.get('recipientName') || '').trim() || undefined,
          recipientPhone: String(form.get('recipientPhone') || '') || undefined,
        }),
      ),
    );
  }

  async function handOverToDelivery() {
    if (!job) return;
    await run(async () => {
      const client = getApiClient();
      let current = job;
      if (current.status === 'PLANNED' || current.status === 'ASSIGNED') {
        current = await client.markDeliveryReadyForDispatch(organizationId, storeId, deliveryId, {
          expectedVersion: current.version,
        });
      }
      if (!current.handedOverAt) {
        current = await client.handoverDelivery(organizationId, storeId, deliveryId, {
          expectedVersion: current.version,
        });
      }
      if (current.status !== 'IN_TRANSIT') {
        await client.startDeliveryTransit(organizationId, storeId, deliveryId, {
          expectedVersion: current.version,
        });
      }
    });
  }

  async function finishDelivery() {
    if (!job) return;
    await run(async () => {
      const client = getApiClient();
      let current = job;
      if (current.status !== 'IN_TRANSIT' && current.status !== 'DELIVERED') {
        if (current.status === 'PLANNED' || current.status === 'ASSIGNED') {
          current = await client.markDeliveryReadyForDispatch(organizationId, storeId, deliveryId, {
            expectedVersion: current.version,
          });
        }
        if (!current.handedOverAt) {
          current = await client.handoverDelivery(organizationId, storeId, deliveryId, {
            expectedVersion: current.version,
          });
        }
        if (current.status !== 'IN_TRANSIT') {
          current = await client.startDeliveryTransit(organizationId, storeId, deliveryId, {
            expectedVersion: current.version,
          });
        }
      }
      await client.markDeliveryDelivered(
        organizationId,
        storeId,
        deliveryId,
        { expectedVersion: current.version },
        { idempotencyKey: newIdempotencyKey('deliver') },
      );
      const fresh = await client.getOrder(organizationId, storeId, job.orderId);
      if (fresh.status === 'READY') {
        await client.completeOrder(organizationId, storeId, job.orderId);
      }
    });
  }

  const orderPhase = summary
    ? resolveOrderPhase(
        { status: summary.orderStatus ?? 'DRAFT' },
        { status: job?.status ?? 'DRAFT', handedOverAt: job?.handedOverAt },
      )
    : null;

  if (!canRead) {
    return (
      <main>
        <PageContainer>
          <ErrorState message="Доступ запрещён: требуется delivery:read." />
        </PageContainer>
      </main>
    );
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Доставка"
          refCode={job?.number}
          description={
            job
              ? `${deliveryStatusLabel(job.status)} · ${formatWindow(job.windowStart, job.windowEnd)}`
              : undefined
          }
          breadcrumbs={[
            { label: 'Доставка', href: `${base}/deliveries` },
            { label: job?.displayAddress?.trim() || job?.addressLine?.trim() || 'Карточка' },
          ]}
          actions={
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void load()}>
              Обновить
            </Button>
          }
        />

        {loading ? <LoadingState message="Загрузка доставки…" /> : null}
        {error ? <ErrorState message={error} /> : null}

        {!loading && summary && job ? (
          <>
            {journeyOrder ? (
              <OrderJourneyTree
                basePath={base}
                compact
                title="Путь заказа"
                order={journeyOrder}
                delivery={{
                  id: job.id,
                  number: job.number,
                  status: job.status,
                  handedOverAt: job.handedOverAt,
                }}
                sale={linkedSale}
                links={{
                  order: canReadOrders,
                  delivery: true,
                  sale: canReadSales,
                }}
                permissions={{ createSale: auth.hasPermission('sales:create') }}
              />
            ) : null}
            <Section>
              <Card title="Статус">
                <div className="meta-row">
                  <StatusBadge status={job.status} />
                  <span>{deliveryStatusLabel(job.status)}</span>
                </div>
                <p style={{ marginTop: 12 }}>
                  Заказ:{' '}
                  {summary.orderNumber ? (
                    <Link href={`${base}/orders/${job.orderId}`}>{summary.orderNumber}</Link>
                  ) : (
                    job.orderId
                  )}
                  {' · '}
                  <OrderPhaseBadge
                    phase={resolveOrderPhase(
                      { status: summary.orderStatus ?? 'DRAFT' },
                      { status: job.status, handedOverAt: job.handedOverAt },
                    )}
                  />
                </p>
                <p className="field__hint">
                  Управление из карточки заказа или здесь — те же шаги.
                </p>
                <div className="delivery-action-row" style={{ marginTop: 16 }}>
                  {auth.hasPermission('delivery:dispatch') &&
                  orderPhase === 'READY' &&
                  job.status !== 'IN_TRANSIT' &&
                  job.status !== 'DELIVERED' ? (
                    <Button type="button" disabled={busy} onClick={() => void handOverToDelivery()}>
                      Передан в доставку
                    </Button>
                  ) : null}
                  {auth.hasPermission('delivery:complete') &&
                  orderPhase === 'READY' &&
                  (job.status === 'IN_TRANSIT' || job.handedOverAt) ? (
                    <Button type="button" disabled={busy} onClick={() => void finishDelivery()}>
                      Передан (доставка)
                    </Button>
                  ) : null}
                  {auth.hasPermission('delivery:cancel') &&
                  !['DELIVERED', 'CANCELLED'].includes(job.status) ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => setConfirmCancel(true)}
                    >
                      Отменить
                    </Button>
                  ) : null}
                </div>
              </Card>
            </Section>

            <Section>
              <Card title="Адрес из заказа">
                {auth.hasPermission('delivery:update') &&
                !['DELIVERED', 'CANCELLED', 'IN_TRANSIT'].includes(job.status) ? (
                  <form className="stack-form" onSubmit={onUpdateAddress} noValidate>
                    <Field label="Получатель" required error={addressErrors.recipientName}>
                      <Input
                        name="recipientName"
                        defaultValue={job.recipientName}
                        required
                      />
                    </Field>
                    <Field label="Телефон">
                      <Input
                        name="recipientPhone"
                        defaultValue={job.recipientPhone}
                        placeholder="+375 …"
                        inputMode="tel"
                      />
                    </Field>
                    <Field label="Адрес" required error={addressErrors.addressLine}>
                      <AddressAutocomplete
                        organizationId={organizationId}
                        storeId={storeId}
                        value={editAddressLine}
                        onChange={setEditAddressLine}
                        onSelect={(hit) => {
                          if (hit.city) setEditCity(hit.city);
                        }}
                        city={editCity || undefined}
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
                      <Field label="Город" required error={addressErrors.city}>
                        <Input
                          value={editCity}
                          onChange={(e) => setEditCity(e.target.value)}
                          placeholder="Город"
                          required
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
                    <Button type="submit" disabled={busy}>
                      Сохранить адрес
                    </Button>
                  </form>
                ) : (
                  <div className="stack-form">
                    <p className="order-address">
                      <strong>{job.displayAddress}</strong>
                    </p>
                    <p>
                      {job.recipientName}
                      {job.recipientPhone ? ` · ${job.recipientPhone}` : ''}
                    </p>
                    <NavigationButtons
                      mapsUrl={summary.mapsUrl ?? summary.navigationUrl}
                      navigatorUrl={summary.navigatorUrl}
                      latitude={job.latitude}
                      longitude={job.longitude}
                    />
                  </div>
                )}
              </Card>
            </Section>

            {canPayment && summary.payment ? (
              <Section>
                <Card title="Оплата">
                  <div className="meta-row">
                    <StatusBadge status={summary.payment.paymentStatus} />
                    <span>Итого: {summary.payment.orderTotal}</span>
                    <span>Оплачено: {summary.payment.paidAmount}</span>
                    <span>К доплате: {summary.payment.balanceDue}</span>
                  </div>
                </Card>
              </Section>
            ) : null}

            <Section>
              <Card title="Проблемы">
                {job.status === 'PROBLEM' ? (
                  <InlineAlert tone="warning" title="Открытая проблема">
                    Нужно разрешить проблему ниже.
                  </InlineAlert>
                ) : null}
                {auth.hasPermission('delivery:report-problem') &&
                !['DELIVERED', 'CANCELLED', 'DRAFT'].includes(job.status) ? (
                  <form
                    className="stack-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!problemDescription.trim()) return;
                      void run(() =>
                        getApiClient().reportDeliveryProblem(organizationId, storeId, deliveryId, {
                          expectedVersion: job.version,
                          type: problemType,
                          description: problemDescription.trim(),
                        }),
                      ).then(() => setProblemDescription(''));
                    }}
                  >
                    <label>
                      Тип
                      <select value={problemType} onChange={(e) => setProblemType(e.target.value)}>
                        {DELIVERY_PROBLEM_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Input
                      value={problemDescription}
                      onChange={(e) => setProblemDescription(e.target.value)}
                      placeholder="Описание"
                      required
                    />
                    <Button type="submit" disabled={busy}>
                      Сообщить о проблеме
                    </Button>
                  </form>
                ) : null}
                {auth.hasPermission('delivery:resolve-problem') && openProblems.length > 0 ? (
                  <form
                    className="stack-form"
                    style={{ marginTop: 16 }}
                    onSubmit={(e) => {
                      e.preventDefault();
                      const problemId = openProblems[0]?.id;
                      if (!problemId || !resolution.trim()) return;
                      void run(() =>
                        getApiClient().resolveDeliveryProblem(
                          organizationId,
                          storeId,
                          deliveryId,
                          problemId,
                          {
                            expectedVersion: job.version,
                            resolution: resolution.trim(),
                            resolveToStatus,
                          },
                          { idempotencyKey: newIdempotencyKey('resolve') },
                        ),
                      ).then(() => setResolution(''));
                    }}
                  >
                    <p>Открытых проблем: {openProblems.length}</p>
                    <label>
                      Вернуть в статус
                      <select
                        value={resolveToStatus}
                        onChange={(e) => setResolveToStatus(e.target.value)}
                      >
                        {['PLANNED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'].map((s) => (
                          <option key={s} value={s}>
                            {deliveryStatusLabel(s)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Input
                      value={resolution}
                      onChange={(e) => setResolution(e.target.value)}
                      placeholder="Решение"
                      required
                    />
                    <Button type="submit" disabled={busy}>
                      Разрешить
                    </Button>
                  </form>
                ) : null}
              </Card>
            </Section>

            <p className="field__hint">
              История действий — в журнале аудита.
              {canAudit ? (
                <>
                  {' '}
                  <Link href={`/organizations/${organizationId}/audit`}>Открыть аудит</Link>
                </>
              ) : null}
            </p>
          </>
        ) : null}
      </PageContainer>

      <ConfirmDialog
        open={confirmCancel}
        title="Отменить доставку?"
        message="Доставка будет отменена. Заказ останется — его можно переоформить."
        confirmLabel="Отменить доставку"
        busy={busy}
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => {
          if (!job) return;
          void run(() =>
            getApiClient().cancelDelivery(
              organizationId,
              storeId,
              deliveryId,
              { expectedVersion: job.version, reason: 'Cancelled from UI' },
              { idempotencyKey: newIdempotencyKey('cancel') },
            ),
          ).then(() => setConfirmCancel(false));
        }}
      />
    </main>
  );
}
