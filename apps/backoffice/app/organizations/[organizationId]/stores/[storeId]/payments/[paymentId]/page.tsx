'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { ApiClientError } from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';

type Payment = Awaited<ReturnType<ReturnType<typeof getApiClient>['getPayment']>>;
type TimelineEvent = Awaited<ReturnType<ReturnType<typeof getApiClient>['getPaymentTimeline']>>[number];
type Refund = Awaited<ReturnType<ReturnType<typeof getApiClient>['listPaymentRefunds']>>[number];
type PaymentMethod = Awaited<ReturnType<ReturnType<typeof getApiClient>['listPaymentMethods']>>[number];

function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `pay_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export default function PaymentDetailPage() {
  const params = useParams<{ organizationId: string; storeId: string; paymentId: string }>();
  const auth = useAuth();
  const { organizationId, storeId, paymentId } = params;
  const base = `/organizations/${organizationId}/stores/${storeId}`;

  const [payment, setPayment] = useState<Payment | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [annulReason, setAnnulReason] = useState('');
  const [showRefund, setShowRefund] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refundMethodId, setRefundMethodId] = useState('');

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const client = getApiClient();
      const [detail, events, refundList, methodList] = await Promise.all([
        client.getPayment(organizationId, storeId, paymentId),
        client.getPaymentTimeline(organizationId, storeId, paymentId),
        client.listPaymentRefunds(organizationId, storeId, paymentId),
        auth.hasPermission('payments:refund')
          ? client.listPaymentMethods(organizationId, storeId, { activeOnly: true })
          : Promise.resolve([] as PaymentMethod[]),
      ]);
      setPayment(detail);
      setTimeline(events);
      setRefunds(refundList);
      setMethods(methodList);
      if (methodList[0] && !refundMethodId) {
        setRefundMethodId(methodList[0].id);
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось загрузить');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!auth.hasPermission('payments:read')) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, storeId, paymentId, auth]);

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

  async function onComplete() {
    await run(() =>
      getApiClient().completePayment(organizationId, storeId, paymentId, newIdempotencyKey()),
    );
  }

  async function onAnnul(event: FormEvent) {
    event.preventDefault();
    if (!annulReason.trim()) return;
    await run(async () => {
      await getApiClient().annulPayment(
        organizationId,
        storeId,
        paymentId,
        { reason: annulReason.trim() },
        newIdempotencyKey(),
      );
      setAnnulReason('');
    });
  }

  async function onCreateRefund(event: FormEvent) {
    event.preventDefault();
    if (!refundAmount.trim() || !refundReason.trim() || !refundMethodId) return;
    await run(async () => {
      await getApiClient().createPaymentRefund(organizationId, storeId, paymentId, {
        amount: refundAmount.trim(),
        reason: refundReason.trim(),
        methodId: refundMethodId,
      });
      setRefundAmount('');
      setRefundReason('');
      setShowRefund(false);
    });
  }

  async function onCompleteRefund(refundId: string) {
    await run(() =>
      getApiClient().completeRefund(organizationId, storeId, refundId, newIdempotencyKey()),
    );
  }

  if (!auth.hasPermission('payments:read')) {
    return <p className="page-state">Доступ запрещён</p>;
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title={payment ? `Платёж ${payment.number}` : 'Платёж'}
          description="DRAFT → COMPLETED → ANNULLED. Возвраты отдельно."
          breadcrumbs={[
            { label: 'Организации', href: '/organizations' },
            { label: 'Организация', href: `/organizations/${organizationId}` },
            { label: 'Магазин', href: base },
            { label: 'Платежи', href: `${base}/payments` },
            { label: payment?.number ?? 'Payment' },
          ]}
          actions={payment ? <StatusBadge status={payment.status} /> : undefined}
        />

        {loading ? <LoadingState /> : null}
        {error ? <ErrorState message={error} /> : null}

        {payment ? (
          <>
            <Section>
              <Card title="Сводка">
                <div className="stack-form">
                  <div className="meta-row">
                    <StatusBadge status={payment.type} />
                    <StatusBadge status={payment.direction} />
                    <span>
                      {payment.amount} {payment.currencyCode}
                    </span>
                  </div>
                  <div className="meta-row">
                    <span>Получен: {new Date(payment.receivedAt).toLocaleString()}</span>
                    {payment.completedAt ? (
                      <span>Завершён: {new Date(payment.completedAt).toLocaleString()}</span>
                    ) : null}
                  </div>
                  {payment.comment ? <p style={{ margin: 0 }}>{payment.comment}</p> : null}
                  {payment.externalReference ? (
                    <p style={{ margin: 0 }}>Ref: {payment.externalReference}</p>
                  ) : null}
                  {payment.annulReason ? (
                    <p style={{ margin: 0, color: 'var(--color-danger, #b42318)' }}>
                      Аннулирование: {payment.annulReason}
                    </p>
                  ) : null}
                  <ul className="list-stack">
                    {payment.allocations.map((alloc) => (
                      <li key={alloc.id}>
                        <div className="meta-row">
                          <StatusBadge status={alloc.targetType} />
                          <span>
                            {alloc.targetType === 'ORDER' ? (
                              <Link href={`${base}/orders/${alloc.targetId}`}>
                                {alloc.targetId.slice(0, 8)}…
                              </Link>
                            ) : alloc.targetType === 'SALE' ? (
                              <Link href={`${base}/sales/${alloc.targetId}`}>
                                {alloc.targetId.slice(0, 8)}…
                              </Link>
                            ) : (
                              alloc.targetId.slice(0, 8) + '…'
                            )}
                          </span>
                          <span>{alloc.amount}</span>
                          {!alloc.isActive ? <StatusBadge status="INACTIVE" /> : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </Card>
            </Section>

            <Section>
              <Card title="Действия">
                <div className="page-header__actions">
                  {payment.status === 'DRAFT' && auth.hasPermission('payments:complete') ? (
                    <Button type="button" disabled={busy} onClick={() => void onComplete()}>
                      Завершить платёж
                    </Button>
                  ) : null}
                  {payment.status === 'COMPLETED' && auth.hasPermission('payments:refund') ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => setShowRefund((v) => !v)}
                    >
                      {showRefund ? 'Скрыть возврат' : 'Возврат'}
                    </Button>
                  ) : null}
                </div>

                {payment.status === 'COMPLETED' && auth.hasPermission('payments:annul') ? (
                  <form onSubmit={onAnnul} className="stack-form" style={{ marginTop: 16 }}>
                    <Input
                      placeholder="Причина аннулирования"
                      value={annulReason}
                      onChange={(e) => setAnnulReason(e.target.value)}
                      required
                    />
                    <Button type="submit" variant="secondary" disabled={busy || !annulReason.trim()}>
                      Аннулировать
                    </Button>
                  </form>
                ) : null}

                {showRefund && auth.hasPermission('payments:refund') ? (
                  <form onSubmit={onCreateRefund} className="stack-form" style={{ marginTop: 16 }}>
                    <select
                      value={refundMethodId}
                      onChange={(e) => setRefundMethodId(e.target.value)}
                      required
                    >
                      {methods.map((method) => (
                        <option key={method.id} value={method.id}>
                          {method.name} ({method.code})
                        </option>
                      ))}
                    </select>
                    <Input
                      placeholder="Сумма возврата"
                      value={refundAmount}
                      onChange={(e) => setRefundAmount(e.target.value)}
                      required
                    />
                    <Input
                      placeholder="Причина возврата"
                      value={refundReason}
                      onChange={(e) => setRefundReason(e.target.value)}
                      required
                    />
                    <Button
                      type="submit"
                      disabled={busy || !refundAmount.trim() || !refundReason.trim()}
                    >
                      Создать возврат
                    </Button>
                  </form>
                ) : null}
              </Card>
            </Section>

            <Section>
              <Card title="Возвраты">
                {refunds.length === 0 ? (
                  <p style={{ margin: 0, color: 'var(--color-muted)' }}>Возвратов нет.</p>
                ) : (
                  <ul className="list-stack">
                    {refunds.map((refund) => (
                      <li key={refund.id}>
                        <div className="meta-row">
                          <strong>{refund.amount}</strong>
                          <StatusBadge status={refund.status} />
                          <span>{refund.reason}</span>
                          {refund.status === 'DRAFT' && auth.hasPermission('payments:refund') ? (
                            <Button
                              type="button"
                              disabled={busy}
                              onClick={() => void onCompleteRefund(refund.id)}
                            >
                              Завершить
                            </Button>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
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
                      {event.message ? <p style={{ margin: '4px 0 0' }}>{event.message}</p> : null}
                    </li>
                  ))}
                </ul>
              </Card>
            </Section>
          </>
        ) : null}
      </PageContainer>
    </main>
  );
}
