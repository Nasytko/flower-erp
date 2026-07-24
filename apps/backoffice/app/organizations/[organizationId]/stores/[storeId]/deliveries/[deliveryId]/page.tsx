'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import {
  ApiClientError,
  type DeliveryJobDto,
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problemType, setProblemType] = useState<string>(DELIVERY_PROBLEM_TYPES[0]);
  const [problemDescription, setProblemDescription] = useState('');
  const [resolveToStatus, setResolveToStatus] = useState('IN_TRANSIT');
  const [resolution, setResolution] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);

  const canRead = auth.hasPermission('delivery:read');
  const canPayment = auth.hasPermission('delivery:view-payment-summary');
  const canAudit = auth.hasPermission('audit:read');

  const job = summary?.delivery ?? null;
  const problems = useMemo(() => openProblemIds(timeline), [timeline]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = getApiClient();
      const [sum, tl] = await Promise.all([
        client.getDeliverySummary(organizationId, storeId, deliveryId),
        client.getDeliveryTimeline(organizationId, storeId, deliveryId),
      ]);
      setSummary(sum);
      setTimeline(tl);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось загрузить доставку');
    } finally {
      setLoading(false);
    }
  }, [organizationId, storeId, deliveryId]);

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
          postalCode: job.postalCode,
          entrance: job.entrance,
          floor: job.floor,
          apartment: job.apartment,
          accessCode: job.accessCode,
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
                  {summary.orderReady ? ' · букет готов' : ' · ещё собирается'}
                </p>
                <p className="field__hint">
                  Курьера не назначаем. Достаточно статусов: к передаче → передали → доставили.
                </p>
                <div className="delivery-action-row" style={{ marginTop: 16 }}>
                  {auth.hasPermission('delivery:dispatch') && job.status === 'DRAFT' ? (
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          getApiClient().planDelivery(organizationId, storeId, deliveryId, {
                            expectedVersion: job.version,
                          }),
                        )
                      }
                    >
                      Подтвердить
                    </Button>
                  ) : null}
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
                      К передаче
                    </Button>
                  ) : null}
                  {auth.hasPermission('delivery:dispatch') &&
                  (job.status === 'READY_FOR_DISPATCH' || job.status === 'ASSIGNED') ? (
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const client = getApiClient();
                          let current = job;
                          if (!current.handedOverAt) {
                            current = await client.handoverDelivery(
                              organizationId,
                              storeId,
                              deliveryId,
                              { expectedVersion: current.version },
                            );
                          }
                          if (current.status !== 'IN_TRANSIT') {
                            await client.startDeliveryTransit(organizationId, storeId, deliveryId, {
                              expectedVersion: current.version,
                            });
                          }
                        })
                      }
                    >
                      Передали в доставку
                    </Button>
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
                      Доставили
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
                  <form className="stack-form" onSubmit={onUpdateAddress}>
                    <Input
                      name="recipientName"
                      defaultValue={job.recipientName}
                      placeholder="Получатель"
                    />
                    <Input
                      name="recipientPhone"
                      defaultValue={job.recipientPhone}
                      placeholder="Телефон"
                    />
                    <Input
                      name="addressLine"
                      defaultValue={job.addressLine}
                      placeholder="Адрес"
                      required
                    />
                    <Input name="city" defaultValue={job.city} placeholder="Город" required />
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
                  <div className="stack-form">
                    <p className="order-address">
                      <strong>{job.displayAddress}</strong>
                    </p>
                    <p>
                      {job.recipientName}
                      {job.recipientPhone ? ` · ${job.recipientPhone}` : ''}
                    </p>
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
