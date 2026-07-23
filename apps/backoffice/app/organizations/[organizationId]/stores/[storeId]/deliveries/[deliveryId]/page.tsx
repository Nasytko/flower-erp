'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import {
  ApiClientError,
  type CourierProfileDto,
  type DeliveryJobDto,
  type DeliveryRoutePlanDto,
  type DeliverySummaryDto,
  type DeliveryTimelineEventDto,
} from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';
import { ConfirmDialog, InlineAlert } from '@/components/workspace/workspace-ui';
import {
  DELIVERY_METHOD_LABELS,
  DELIVERY_PROBLEM_TYPES,
  deliveryStatusLabel,
  formatWindow,
  newIdempotencyKey,
} from '@/lib/delivery-labels';

function openProblemIds(timeline: DeliveryTimelineEventDto[]): string[] {
  const open = new Set<string>();
  for (const event of timeline) {
    const payload = event.payload as { problemId?: string } | null;
    const problemId = payload?.problemId;
    if (!problemId) continue;
    if (event.type === 'PROBLEM_REPORTED') open.add(problemId);
    if (event.type === 'PROBLEM_RESOLVED') open.delete(problemId);
  }
  return [...open];
}

export default function DeliveryDetailPage() {
  const params = useParams<{ organizationId: string; storeId: string; deliveryId: string }>();
  const auth = useAuth();
  const { organizationId, storeId, deliveryId } = params;
  const base = `/organizations/${organizationId}/stores/${storeId}`;

  const [summary, setSummary] = useState<DeliverySummaryDto | null>(null);
  const [timeline, setTimeline] = useState<DeliveryTimelineEventDto[]>([]);
  const [couriers, setCouriers] = useState<CourierProfileDto[]>([]);
  const [route, setRoute] = useState<DeliveryRoutePlanDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [courierId, setCourierId] = useState('');
  const [problemType, setProblemType] = useState<string>(DELIVERY_PROBLEM_TYPES[0]);
  const [problemDescription, setProblemDescription] = useState('');
  const [resolveToStatus, setResolveToStatus] = useState('ASSIGNED');
  const [resolution, setResolution] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');

  const canRead = auth.hasPermission('delivery:read');
  const canPayment = auth.hasPermission('delivery:view-payment-summary');

  const job = summary?.delivery ?? null;
  const problems = useMemo(() => openProblemIds(timeline), [timeline]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = getApiClient();
      const [sum, tl, courierList, routes] = await Promise.all([
        client.getDeliverySummary(organizationId, storeId, deliveryId),
        client.getDeliveryTimeline(organizationId, storeId, deliveryId),
        auth.hasPermission('delivery:assign') || auth.hasPermission('delivery:read')
          ? client.listCouriers(organizationId, storeId, { status: 'ACTIVE' })
          : Promise.resolve([] as CourierProfileDto[]),
        client.listDeliveryRoutes(organizationId, storeId),
      ]);
      setSummary(sum);
      setTimeline(tl);
      setCouriers(courierList);
      setLat(sum.delivery.latitude ?? '');
      setLng(sum.delivery.longitude ?? '');
      setCourierId(sum.delivery.assignedCourierId ?? '');
      const matched =
        routes.find((r) => r.stops.some((s) => s.deliveryJobId === deliveryId)) ?? null;
      setRoute(matched);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось загрузить доставку');
    } finally {
      setLoading(false);
    }
  }, [organizationId, storeId, deliveryId, auth]);

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
    await run(() =>
      getApiClient().updateDeliveryAddress(
        organizationId,
        storeId,
        deliveryId,
        withVersion({
          addressLine: String(form.get('addressLine') || ''),
          city: String(form.get('city') || ''),
          postalCode: String(form.get('postalCode') || '') || null,
          entrance: String(form.get('entrance') || '') || null,
          floor: String(form.get('floor') || '') || null,
          apartment: String(form.get('apartment') || '') || null,
          accessCode: String(form.get('accessCode') || '') || null,
          deliveryComment: String(form.get('deliveryComment') || '') || null,
          recipientName: String(form.get('recipientName') || '') || undefined,
          recipientPhone: String(form.get('recipientPhone') || '') || undefined,
        }),
      ),
    );
  }

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
          title={job ? `Доставка ${job.number}` : 'Доставка'}
          description={
            job
              ? `${deliveryStatusLabel(job.status)} · ${formatWindow(job.windowStart, job.windowEnd)}`
              : 'Загрузка…'
          }
          breadcrumbs={[
            { label: 'Доставка', href: `${base}/deliveries` },
            { label: job?.number ?? deliveryId },
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
            <Section>
              <Card title="Статус и действия">
                <div className="meta-row">
                  <StatusBadge status={job.status} />
                  <span>{deliveryStatusLabel(job.status)}</span>
                  {summary.urgency && summary.urgency !== 'NORMAL' ? (
                    <span className={`urgency-badge urgency-badge--${summary.urgency.toLowerCase()}`}>
                      {summary.urgency}
                    </span>
                  ) : null}
                  <span>v{job.version}</span>
                  <span>{DELIVERY_METHOD_LABELS[job.method] ?? job.method}</span>
                </div>
                <p style={{ marginTop: 12 }}>
                  Заказ:{' '}
                  {summary.orderNumber ? (
                    <Link href={`${base}/orders/${job.orderId}`}>{summary.orderNumber}</Link>
                  ) : (
                    job.orderId
                  )}
                  {summary.orderStatus ? ` · ${summary.orderStatus}` : ''}
                  {summary.orderReady ? ' · готов' : ''}
                </p>
                <div className="delivery-action-row" style={{ marginTop: 16 }}>
                  {auth.hasPermission('delivery:dispatch') &&
                  (job.status === 'PLANNED' || job.status === 'ASSIGNED') ? (
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          getApiClient().markDeliveryReadyForDispatch(
                            organizationId,
                            storeId,
                            deliveryId,
                            { expectedVersion: job.version },
                          ),
                        )
                      }
                    >
                      Готово к отправке
                    </Button>
                  ) : null}
                  {auth.hasPermission('delivery:dispatch') &&
                  (job.status === 'READY_FOR_DISPATCH' || job.status === 'ASSIGNED') ? (
                    <>
                      <Button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void run(() =>
                            getApiClient().handoverDelivery(organizationId, storeId, deliveryId, {
                              expectedVersion: job.version,
                            }),
                          )
                        }
                      >
                        Передать курьеру
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={busy}
                        onClick={() =>
                          void run(() =>
                            getApiClient().startDeliveryTransit(
                              organizationId,
                              storeId,
                              deliveryId,
                              { expectedVersion: job.version },
                            ),
                          )
                        }
                      >
                        В путь
                      </Button>
                    </>
                  ) : null}
                  {auth.hasPermission('delivery:complete') && job.status === 'IN_TRANSIT' ? (
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          getApiClient().markDeliveryDelivered(
                            organizationId,
                            storeId,
                            deliveryId,
                            { expectedVersion: job.version },
                            { idempotencyKey: newIdempotencyKey('deliver') },
                          ),
                        )
                      }
                    >
                      Доставлено
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
                  {summary.navigationUrl ? (
                    <a href={summary.navigationUrl} target="_blank" rel="noreferrer">
                      <Button type="button" variant="secondary">
                        Открыть в навигаторе
                      </Button>
                    </a>
                  ) : null}
                </div>
              </Card>
            </Section>

            <Section>
              <Card title="Адрес">
                {auth.hasPermission('delivery:update') ? (
                  <form className="stack-form" onSubmit={onUpdateAddress}>
                    <Input name="recipientName" defaultValue={job.recipientName} placeholder="Получатель" />
                    <Input name="recipientPhone" defaultValue={job.recipientPhone} placeholder="Телефон" />
                    <Input name="addressLine" defaultValue={job.addressLine} placeholder="Адрес" required />
                    <Input name="city" defaultValue={job.city} placeholder="Город" required />
                    <Input name="postalCode" defaultValue={job.postalCode ?? ''} placeholder="Индекс" />
                    <Input name="entrance" defaultValue={job.entrance ?? ''} placeholder="Подъезд" />
                    <Input name="floor" defaultValue={job.floor ?? ''} placeholder="Этаж" />
                    <Input name="apartment" defaultValue={job.apartment ?? ''} placeholder="Кв." />
                    <Input name="accessCode" defaultValue={job.accessCode ?? ''} placeholder="Код" />
                    <Input
                      name="deliveryComment"
                      defaultValue={job.deliveryComment ?? ''}
                      placeholder="Комментарий"
                    />
                    <Button type="submit" disabled={busy}>
                      Сохранить адрес
                    </Button>
                  </form>
                ) : (
                  <p>{job.displayAddress}</p>
                )}
                <div className="stack-form" style={{ marginTop: 16 }}>
                  <p>
                    Геокодирование: <StatusBadge status={job.geocodingStatus} />{' '}
                    {job.geocodingStatus}
                  </p>
                  {auth.hasPermission('delivery:update') ? (
                    <>
                      <div className="delivery-action-row">
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={busy}
                          onClick={() =>
                            void run(() =>
                              getApiClient().geocodeDelivery(organizationId, storeId, deliveryId, {
                                expectedVersion: job.version,
                              }),
                            )
                          }
                        >
                          Геокодировать
                        </Button>
                      </div>
                      <label>
                        Широта
                        <Input value={lat} onChange={(e) => setLat(e.target.value)} />
                      </label>
                      <label>
                        Долгота
                        <Input value={lng} onChange={(e) => setLng(e.target.value)} />
                      </label>
                      <Button
                        type="button"
                        disabled={busy || !lat.trim() || !lng.trim()}
                        onClick={() =>
                          void run(() =>
                            getApiClient().setDeliveryCoordinates(
                              organizationId,
                              storeId,
                              deliveryId,
                              {
                                expectedVersion: job.version,
                                latitude: lat.trim(),
                                longitude: lng.trim(),
                              },
                            ),
                          )
                        }
                      >
                        Сохранить координаты
                      </Button>
                    </>
                  ) : null}
                </div>
              </Card>
            </Section>

            <Section>
              <Card title="Курьер">
                <div className="stack-form">
                  <label>
                    Курьер
                    <select value={courierId} onChange={(e) => setCourierId(e.target.value)}>
                      <option value="">—</option>
                      {couriers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.displayNameSnapshot}
                          {c.phoneSnapshot ? ` (${c.phoneSnapshot})` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  {auth.hasPermission('delivery:assign') ? (
                    <div className="delivery-action-row">
                      {!job.assignedCourierId ? (
                        <Button
                          type="button"
                          disabled={busy || !courierId}
                          onClick={() =>
                            void run(() =>
                              getApiClient().assignDeliveryCourier(
                                organizationId,
                                storeId,
                                deliveryId,
                                { expectedVersion: job.version, courierProfileId: courierId },
                              ),
                            )
                          }
                        >
                          Назначить
                        </Button>
                      ) : (
                        <>
                          <Button
                            type="button"
                            disabled={busy || !courierId}
                            onClick={() =>
                              void run(() =>
                                getApiClient().reassignDeliveryCourier(
                                  organizationId,
                                  storeId,
                                  deliveryId,
                                  { expectedVersion: job.version, courierProfileId: courierId },
                                ),
                              )
                            }
                          >
                            Переназначить
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={busy}
                            onClick={() =>
                              void run(() =>
                                getApiClient().releaseDeliveryCourier(
                                  organizationId,
                                  storeId,
                                  deliveryId,
                                  { expectedVersion: job.version, reason: 'Released from UI' },
                                ),
                              )
                            }
                          >
                            Снять курьера
                          </Button>
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              </Card>
            </Section>

            {route ? (
              <Section>
                <Card title="Маршрут">
                  <p>
                    <Link href={`${base}/delivery-routes/${route.id}`}>
                      {route.name} ({route.status})
                    </Link>
                  </p>
                  <p>
                    Стоп #
                    {route.stops.find((s) => s.deliveryJobId === deliveryId)?.sequence ?? '—'}
                  </p>
                </Card>
              </Section>
            ) : null}

            {canPayment && summary.payment ? (
              <Section>
                <Card title="Оплата">
                  <div className="meta-row">
                    <StatusBadge status={summary.payment.paymentStatus} />
                    <span>Итого: {summary.payment.orderTotal}</span>
                    <span>Оплачено: {summary.payment.paidAmount}</span>
                    <span>Возврат: {summary.payment.refundedAmount}</span>
                    <span>К доплате: {summary.payment.balanceDue}</span>
                  </div>
                </Card>
              </Section>
            ) : null}

            <Section>
              <Card title="Проблемы">
                {job.status === 'PROBLEM' ? (
                  <InlineAlert tone="warning" title="Открытая проблема">
                    Статус PROBLEM. Разрешите проблему ниже.
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
                {auth.hasPermission('delivery:resolve-problem') && problems.length > 0 ? (
                  <form
                    className="stack-form"
                    style={{ marginTop: 16 }}
                    onSubmit={(e) => {
                      e.preventDefault();
                      const problemId = problems[0];
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
                    <p>Открытых проблем: {problems.length}</p>
                    <label>
                      Вернуть в статус
                      <select
                        value={resolveToStatus}
                        onChange={(e) => setResolveToStatus(e.target.value)}
                      >
                        {['PLANNED', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'].map(
                          (s) => (
                            <option key={s} value={s}>
                              {deliveryStatusLabel(s)}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                    <Input
                      value={resolution}
                      onChange={(e) => setResolution(e.target.value)}
                      placeholder="Решение"
                      required
                    />
                    <Button type="submit" disabled={busy}>
                      Разрешить проблему
                    </Button>
                  </form>
                ) : null}
              </Card>
            </Section>

            <Section>
              <Card title="Таймлайн">
                <ul className="list-stack">
                  {timeline.map((event) => (
                    <li key={event.id}>
                      <div className="meta-row">
                        <StatusBadge status={event.type} />
                        <span>{new Date(event.occurredAt).toLocaleString()}</span>
                      </div>
                      {event.message ? <p>{event.message}</p> : null}
                    </li>
                  ))}
                </ul>
              </Card>
            </Section>
          </>
        ) : null}
      </PageContainer>

      <ConfirmDialog
        open={confirmCancel}
        title="Отменить доставку?"
        message="Доставка будет отменена. Это действие нельзя отменить."
        confirmLabel="Отменить доставку"
        destructive
        busy={busy}
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => {
          if (!job) return;
          setConfirmCancel(false);
          void run(() =>
            getApiClient().cancelDelivery(
              organizationId,
              storeId,
              deliveryId,
              { expectedVersion: job.version, reason: null },
              { idempotencyKey: newIdempotencyKey('cancel') },
            ),
          );
        }}
      />
    </main>
  );
}
