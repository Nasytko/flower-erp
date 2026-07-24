'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Button, Card } from '@flower/ui';
import { ApiClientError } from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { Field } from '@/components/layout/field';
import { MoneyBynInput, parseBynToApi } from '@/components/layout/money-byn-input';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';
import { statusLabelRu, timelineMessageRu } from '@/lib/status-labels-ru';

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
    <Suspense
      fallback={
        <main>
          <LoadingState message="Загрузка…" />
        </main>
      }
    >
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
    searchParams.get('completed') === '1' ? 'Продажа завершена, состав списан со склада.' : null,
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
      setError(err instanceof ApiClientError ? err.message : 'Не удалось загрузить');
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
      setError(err instanceof ApiClientError ? err.message : 'Действие не выполнено');
    } finally {
      setBusy(false);
    }
  }

  async function onComplete() {
    await run(async () => {
      await getApiClient().completeSale(organizationId, storeId, saleId, newIdempotencyKey());
      setInfoMessage('Продажа завершена, состав списан со склада.');
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
    const amount = parseBynToApi(payAmount);
    if (!payMethodId || !amount) return;
    await run(async () => {
      const client = getApiClient();
      const payment = await client.createSalePayment(organizationId, storeId, saleId, {
        methodId: payMethodId,
        amount,
      });
      if (auth.hasPermission('payments:complete') && payment.status === 'DRAFT') {
        await client.completePayment(organizationId, storeId, payment.id, newIdempotencyKey());
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
    return <p className="page-state">Доступ запрещён</p>;
  }

  const currency = sale?.currencyCode === 'BYN' || !sale?.currencyCode ? 'BYN' : sale.currencyCode;

  return (
    <main>
      <PageContainer>
        <PageHeader
          title={sale ? `Продажа ${sale.number}` : 'Продажа'}
          description="Черновик → завершена → при необходимости аннулирование. Списание со склада — при завершении."
          breadcrumbs={[
            { label: 'Магазин', href: base },
            { label: 'Продажи', href: `${base}/sales` },
            { label: sale?.number ?? 'Карточка' },
          ]}
          actions={sale ? <StatusBadge status={sale.status} /> : undefined}
        />

        {loading ? <LoadingState message="Загрузка продажи…" /> : null}
        {error ? <ErrorState message={error} /> : null}
        {infoMessage ? (
          <Section>
            <Card title="Сообщение">
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
                      {sale.netAmount} {currency}
                    </span>
                  </div>
                  <div className="meta-row">
                    <span>Сумма до скидки: {sale.grossAmount} {currency}</span>
                    <span>Скидка: {sale.discountAmount} {currency}</span>
                    <span>К оплате: {sale.netAmount} {currency}</span>
                  </div>
                  {canViewCost && sale.costAmount != null ? (
                    <div className="meta-row">
                      <span>Себестоимость: {sale.costAmount} {currency}</span>
                    </div>
                  ) : null}
                  {canViewMargin && sale.grossProfitAmount != null ? (
                    <div className="meta-row">
                      <span>Прибыль: {sale.grossProfitAmount} {currency}</span>
                      {sale.marginPercent != null ? (
                        <span>Маржа: {sale.marginPercent}%</span>
                      ) : null}
                    </div>
                  ) : null}
                  {sale.orderId ? (
                    <p style={{ margin: 0 }}>
                      Заказ:{' '}
                      <Link href={`${base}/orders/${sale.orderId}`}>открыть заказ</Link>
                    </p>
                  ) : null}
                  {sale.comment ? <p style={{ margin: 0 }}>Комментарий: {sale.comment}</p> : null}
                  {sale.annulment ? (
                    <p style={{ margin: 0, color: 'var(--color-destructive)' }}>
                      Аннулирование: {sale.annulment.reason}
                    </p>
                  ) : null}
                </div>
              </Card>
            </Section>

            <Section>
              <Card title="Состав продажи">
                <ul className="list-stack">
                  {sale.lines.map((line) => (
                    <li key={line.id}>
                      <div className="meta-row">
                        <strong>
                          {line.descriptionSnapshot} × {line.quantity}
                        </strong>
                        <span>
                          {line.unitPrice} → {line.netAmount} {currency}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
                {sale.discount && sale.discount.type !== 'NONE' ? (
                  <p style={{ marginTop: 12, color: 'var(--color-muted)' }}>
                    Скидка: {statusLabelRu(sale.discount.type)} {sale.discount.value}
                    {sale.discount.reason
                      ? ` (${statusLabelRu(sale.discount.reason)})`
                      : null}
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
                        <span>Итого: {paymentSummary.totalAmount} {currency}</span>
                        <span>Оплачено: {paymentSummary.paidAmount} {currency}</span>
                        <span>Возврат: {paymentSummary.refundedAmount} {currency}</span>
                        <span>К доплате: {paymentSummary.balanceDue} {currency}</span>
                      </div>
                    </div>
                  ) : (
                    <p style={{ margin: 0, color: 'var(--color-muted)' }}>Сводка оплаты недоступна.</p>
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
                      <Field
                        label="Способ оплаты"
                        tooltip="Выберите, как покупатель оплачивает букет"
                        required
                      >
                        <select
                          className="field-control"
                          value={payMethodId}
                          onChange={(e) => setPayMethodId(e.target.value)}
                          required
                        >
                          {paymentMethods.map((method) => (
                            <option key={method.id} value={method.id}>
                              {method.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field
                        label="Сумма оплаты"
                        tooltip="Сумма в белорусских рублях и копейках"
                        required
                      >
                        <MoneyBynInput value={payAmount} onChange={setPayAmount} required />
                      </Field>
                      <Button
                        type="submit"
                        disabled={busy || !payMethodId || !parseBynToApi(payAmount)}
                      >
                        Добавить оплату
                      </Button>
                    </form>
                  ) : null}
                  <p style={{ margin: '12px 0 0' }}>
                    <Link href={`${base}/payments`}>Все оплаты магазина</Link>
                  </p>
                </Card>
              </Section>
            ) : null}

            <Section>
              <Card title="Списание со склада">
                {!consumption ? (
                  <p style={{ margin: 0, color: 'var(--color-muted)' }}>
                    Появится после завершения продажи.
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
                            <strong>Позиция</strong>
                            <span>
                              запрошено {line.requestedQuantity} / списано {line.issuedQuantity}
                            </span>
                            {canViewCost && line.costAmount != null ? (
                              <span>себестоимость {line.costAmount} {currency}</span>
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
                      Завершить и списать со склада
                    </Button>
                  ) : null}
                </div>
                {sale.status === 'COMPLETED' && auth.hasPermission('sales:annul') ? (
                  <form onSubmit={onAnnul} className="stack-form" style={{ marginTop: 16 }}>
                    <Field
                      label="Причина аннулирования"
                      tooltip="Укажите, почему продажа отменяется — это сохранится в истории"
                      required
                    >
                      <input
                        className="field-control"
                        value={annulReason}
                        onChange={(e) => setAnnulReason(e.target.value)}
                        required
                        placeholder="Например: ошибка состава"
                      />
                    </Field>
                    <Button type="submit" variant="secondary" disabled={busy || !annulReason.trim()}>
                      Аннулировать продажу
                    </Button>
                  </form>
                ) : null}
              </Card>
            </Section>

            <Section>
              <Card title="История">
                <ul className="list-stack">
                  {timeline.map((event) => {
                    const message = timelineMessageRu(event.message);
                    return (
                      <li key={event.id}>
                        <div className="meta-row">
                          <StatusBadge status={event.type} />
                          <span>{new Date(event.occurredAt).toLocaleString('ru-RU')}</span>
                        </div>
                        {message ? <p style={{ margin: '4px 0 0' }}>{message}</p> : null}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </Section>
          </>
        ) : null}
      </PageContainer>
    </main>
  );
}
