'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { ApiClientError } from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';

type SaleDetail = Awaited<ReturnType<ReturnType<typeof getApiClient>['getSale']>>;
type TimelineEvent = Awaited<ReturnType<ReturnType<typeof getApiClient>['getSaleTimeline']>>[number];
type Consumption = Awaited<ReturnType<ReturnType<typeof getApiClient>['getSaleConsumption']>>;
type PaymentSummary = Awaited<ReturnType<ReturnType<typeof getApiClient>['getSalePaymentSummary']>>;
type PaymentMethod = Awaited<
  ReturnType<ReturnType<typeof getApiClient>['listPaymentMethods']>
>[number];

function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `sale_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export default function SaleDetailPage() {
  return (
    <Suspense fallback={<main><LoadingState message="Loading…" /></main>}>
      <SaleDetailPageInner />
    </Suspense>
  );
}

function SaleDetailPageInner() {
  const params = useParams<{ organizationId: string; storeId: string; saleId: string }>();
  const searchParams = useSearchParams();
  const auth = useAuth();
  const { organizationId, storeId, saleId } = params;
  const base = `/organizations/${organizationId}/stores/${storeId}`;

  const [sale, setSale] = useState<SaleDetail | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [consumption, setConsumption] = useState<Consumption>(null);
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [payMethodId, setPayMethodId] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [annulReason, setAnnulReason] = useState('');
  const [infoMessage, setInfoMessage] = useState<string | null>(
    searchParams.get('completed') === '1' ? 'Продажа завершена.' : null,
  );

  const canViewCost = auth.hasPermission('sales:view-cost');
  const canViewMargin = auth.hasPermission('sales:view-margin');
  const canReadPayments = auth.hasPermission('payments:read');

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const client = getApiClient();
      const [detail, events, cons, summary, methods] = await Promise.all([
        client.getSale(organizationId, storeId, saleId),
        client.getSaleTimeline(organizationId, storeId, saleId),
        client.getSaleConsumption(organizationId, storeId, saleId),
        canReadPayments
          ? client.getSalePaymentSummary(organizationId, storeId, saleId)
          : Promise.resolve(null),
        canReadPayments &&
        (auth.hasPermission('payments:create') || auth.hasPermission('payments:complete'))
          ? client.listPaymentMethods(organizationId, storeId, { activeOnly: true })
          : Promise.resolve([] as PaymentMethod[]),
      ]);
      setSale(detail);
      setTimeline(events);
      setConsumption(cons);
      setPaymentSummary(summary);
      setPaymentMethods(methods);
      if (methods[0]) {
        setPayMethodId((prev) => prev || methods[0]!.id);
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!auth.hasPermission('sales:read')) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, storeId, saleId, auth]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  async function onComplete() {
    await run(async () => {
      await getApiClient().completeSale(
        organizationId,
        storeId,
        saleId,
        newIdempotencyKey(),
      );
      setInfoMessage('Продажа завершена.');
    });
  }

  async function onAnnul(event: FormEvent) {
    event.preventDefault();
    if (!annulReason.trim()) return;
    await run(async () => {
      await getApiClient().annulSale(
        organizationId,
        storeId,
        saleId,
        { reason: annulReason.trim() },
        newIdempotencyKey(),
      );
      setAnnulReason('');
      setInfoMessage(null);
    });
  }

  async function onAddPayment(event: FormEvent) {
    event.preventDefault();
    if (!payMethodId || !payAmount.trim()) return;
    await run(async () => {
      const client = getApiClient();
      const payment = await client.createSalePayment(organizationId, storeId, saleId, {
        methodId: payMethodId,
        amount: payAmount.trim(),
      });
      if (auth.hasPermission('payments:complete') && payment.status === 'DRAFT') {
        await client.completePayment(
          organizationId,
          storeId,
          payment.id,
          newIdempotencyKey(),
        );
      }
      setPayAmount('');
    });
  }

  async function onAllocatePrepayments() {
    if (!sale?.orderId) return;
    await run(async () => {
      await getApiClient().allocateOrderPrepaymentsToSale(
        organizationId,
        storeId,
        sale.orderId!,
        { saleId },
        newIdempotencyKey(),
      );
      setInfoMessage('Предоплата перенесена на продажу.');
    });
  }

  if (!auth.hasPermission('sales:read')) {
    return <p className="page-state">Access denied</p>;
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title={sale ? `Продажа ${sale.number}` : 'Продажа'}
          description="DRAFT → COMPLETED → ANNULLED. Списание остатков при завершении."
          breadcrumbs={[
            { label: 'Organizations', href: '/organizations' },
            { label: 'Organization', href: `/organizations/${organizationId}` },
            { label: 'Store', href: base },
            { label: 'Продажи', href: `${base}/sales` },
            { label: sale?.number ?? 'Sale' },
          ]}
          actions={sale ? <StatusBadge status={sale.status} /> : undefined}
        />

        {loading ? <LoadingState /> : null}
        {error ? <ErrorState message={error} /> : null}
        {infoMessage ? (
          <Section>
            <Card title="Статус">
              <p style={{ margin: 0 }}>{infoMessage}</p>
            </Card>
          </Section>
        ) : null}

        {sale ? (
          <>
            <Section>
              <Card title="Сводка">
                <div className="stack-form">
                  <div className="meta-row">
                    <StatusBadge status={sale.type} />
                    <StatusBadge status={sale.salesChannel} />
                    <span>
                      {sale.netAmount} {sale.currencyCode}
                    </span>
                  </div>
                  <div className="meta-row">
                    <span>Gross: {sale.grossAmount}</span>
                    <span>Discount: {sale.discountAmount}</span>
                    <span>Net: {sale.netAmount}</span>
                  </div>
                  {canViewCost && sale.costAmount != null ? (
                    <div className="meta-row">
                      <span>Cost: {sale.costAmount}</span>
                    </div>
                  ) : null}
                  {canViewMargin && sale.grossProfitAmount != null ? (
                    <div className="meta-row">
                      <span>Profit: {sale.grossProfitAmount}</span>
                      {sale.marginPercent != null ? (
                        <span>Margin: {sale.marginPercent}%</span>
                      ) : null}
                    </div>
                  ) : null}
                  {sale.orderId ? (
                    <p style={{ margin: 0 }}>
                      Заказ:{' '}
                      <Link href={`${base}/orders/${sale.orderId}`}>{sale.orderId.slice(0, 8)}…</Link>
                    </p>
                  ) : null}
                  {sale.comment ? <p style={{ margin: 0 }}>{sale.comment}</p> : null}
                  {sale.annulment ? (
                    <p style={{ margin: 0, color: 'var(--color-danger, #b42318)' }}>
                      Аннулирование: {sale.annulment.reason}
                    </p>
                  ) : null}
                </div>
              </Card>
            </Section>

            <Section>
              <Card title="Коммерческие линии">
                <ul className="list-stack">
                  {sale.lines.map((line) => (
                    <li key={line.id}>
                      <div className="meta-row">
                        <strong>
                          {line.descriptionSnapshot} × {line.quantity}
                        </strong>
                        <span>
                          {line.unitPrice} → {line.netAmount}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
                {sale.discount && sale.discount.type !== 'NONE' ? (
                  <p style={{ marginTop: 12, color: 'var(--color-muted)' }}>
                    Скидка {sale.discount.type} {sale.discount.value} ({sale.discount.reason})
                  </p>
                ) : null}
              </Card>
            </Section>

            {canReadPayments ? (
              <Section>
                <Card title="Оплата">
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
                  {sale.orderId &&
                  auth.hasPermission('payments:complete') &&
                  sale.status === 'COMPLETED' ? (
                    <div className="page-header__actions" style={{ marginTop: 16 }}>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => void onAllocatePrepayments()}
                      >
                        Перенести предоплату
                      </Button>
                    </div>
                  ) : null}
                  {auth.hasPermission('payments:create') &&
                  auth.hasPermission('payments:complete') &&
                  sale.status === 'COMPLETED' ? (
                    <form onSubmit={onAddPayment} className="stack-form" style={{ marginTop: 16 }}>
                      <select
                        value={payMethodId}
                        onChange={(e) => setPayMethodId(e.target.value)}
                        required
                      >
                        {paymentMethods.map((method) => (
                          <option key={method.id} value={method.id}>
                            {method.name} ({method.code})
                          </option>
                        ))}
                      </select>
                      <Input
                        placeholder="Сумма оплаты"
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                        required
                      />
                      <Button
                        type="submit"
                        disabled={busy || !payMethodId || !payAmount.trim()}
                      >
                        Добавить оплату
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
              <Card title="Списание (consumption)">
                {!consumption ? (
                  <p style={{ margin: 0, color: 'var(--color-muted)' }}>
                    Ещё нет — появится после завершения продажи.
                  </p>
                ) : (
                  <>
                    <div className="meta-row" style={{ marginBottom: 8 }}>
                      <StatusBadge status={consumption.sourceType} />
                    </div>
                    <ul className="list-stack">
                      {consumption.lines.map((line) => (
                        <li key={line.id}>
                          <div className="meta-row">
                            <strong>{line.itemId.slice(0, 8)}…</strong>
                            <span>
                              req {line.requestedQuantity} / issued {line.issuedQuantity}
                            </span>
                            {canViewCost && line.costAmount != null ? (
                              <span>cost {line.costAmount}</span>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </Card>
            </Section>

            <Section>
              <Card title="Действия">
                <div className="page-header__actions">
                  {sale.status === 'DRAFT' && auth.hasPermission('sales:complete') ? (
                    <Button type="button" disabled={busy} onClick={() => void onComplete()}>
                      Завершить продажу
                    </Button>
                  ) : null}
                </div>
                {sale.status === 'COMPLETED' && auth.hasPermission('sales:annul') ? (
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
