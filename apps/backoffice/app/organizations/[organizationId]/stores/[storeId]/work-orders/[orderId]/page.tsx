'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import {
  ApiClientError,
  type WorkOrderDto,
} from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';
import {
  ConfirmDialog,
  CountdownBadge,
  InlineAlert,
  StickyActionBar,
} from '@/components/workspace/workspace-ui';
import { OrderJourneyTree } from '@/components/order/order-journey-tree';
import { pickLinkedSale } from '@/lib/order-journey';
import {
  orderPhaseLabel,
  resolveOrderPhase,
} from '@/lib/order-ui';

type ActualDraft = {
  itemId: string;
  itemName: string;
  itemCode: string;
  actualQuantity: string;
  batchId: string;
  comment: string;
};

export default function WorkOrderPage() {
  const params = useParams<{ organizationId: string; storeId: string; orderId: string }>();
  const auth = useAuth();
  const router = useRouter();
  const { organizationId, storeId, orderId } = params;
  const base = `/organizations/${organizationId}/stores/${storeId}`;

  const [data, setData] = useState<WorkOrderDto | null>(null);
  const [capturedAt, setCapturedAt] = useState(0);
  const [drafts, setDrafts] = useState<ActualDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmReady, setConfirmReady] = useState(false);
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [deliveryHint, setDeliveryHint] = useState<{
    id: string;
    number: string;
    status: string;
    windowStart: string;
    windowEnd: string;
    handedOverAt?: string | null;
  } | null>(null);
  const [linkedSale, setLinkedSale] = useState<{
    id: string;
    number: string;
    status: string;
  } | null>(null);

  const canRead = auth.hasPermission('workspace:read') || auth.hasPermission('orders:read');
  const canReadDelivery = auth.hasPermission('delivery:read');
  const canReadSales = auth.hasPermission('sales:read');
  const canClaim =
    auth.hasPermission('orders:assign') && auth.hasPermission('orders:prepare');
  const canReserve = auth.hasPermission('orders:reserve');
  const canPrepare = auth.hasPermission('orders:prepare');

  const syncDrafts = useCallback((workOrder: WorkOrderDto) => {
    if (workOrder.actualLines.length > 0) {
      setDrafts(
        workOrder.actualLines.map((line) => ({
          itemId: line.itemId,
          itemName: line.itemName,
          itemCode: line.itemCode,
          actualQuantity: line.actualQuantity,
          batchId: line.batchId ?? '',
          comment: line.comment ?? '',
        })),
      );
      return;
    }
    setDrafts(
      workOrder.plannedLines.map((line) => ({
        itemId: line.itemId,
        itemName: line.itemName,
        itemCode: line.itemCode,
        actualQuantity: line.plannedQuantity,
        batchId: '',
        comment: '',
      })),
    );
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = getApiClient();
      const [workOrder, deliveries, sales] = await Promise.all([
        client.getWorkOrder(organizationId, storeId, orderId),
        canReadDelivery
          ? client.listDeliveries(organizationId, storeId)
          : Promise.resolve([]),
        canReadSales
          ? client.listSales(organizationId, storeId, { orderId })
          : Promise.resolve([]),
      ]);
      setData(workOrder);
      setLinkedSale(pickLinkedSale(sales));
      setCapturedAt(Date.now());
      syncDrafts(workOrder);
      const linked = deliveries.find(
        (d) => d.orderId === orderId && d.status !== 'CANCELLED',
      );
      setDeliveryHint(
        linked
          ? {
              id: linked.id,
              number: linked.number,
              status: linked.status,
              windowStart: linked.windowStart,
              windowEnd: linked.windowEnd,
              handedOverAt: linked.handedOverAt,
            }
          : null,
      );
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось загрузить рабочий заказ');
    } finally {
      setLoading(false);
    }
  }, [organizationId, storeId, orderId, syncDrafts, canReadDelivery, canReadSales]);

  useEffect(() => {
    if (!canRead) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRead, organizationId, storeId, orderId]);

  async function run(action: () => Promise<unknown>, opts?: { reload?: boolean }) {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await action();
      if (opts?.reload !== false) await load();
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'VERSION_CONFLICT') {
        setInfo('Конфликт версий — загружаем последний рабочий заказ. Повторите изменения.');
        await load();
        return;
      }
      setError(err instanceof ApiClientError ? err.message : 'Действие не выполнено');
    } finally {
      setBusy(false);
    }
  }

  async function saveActual(event: FormEvent) {
    event.preventDefault();
    if (!data) return;
    await run(() =>
      getApiClient().setActualComposition(organizationId, storeId, orderId, {
        expectedVersion: data.version,
        items: drafts.map((line, index) => ({
          itemId: line.itemId,
          actualQuantity: line.actualQuantity,
          batchId: line.batchId || null,
          comment: line.comment || undefined,
          sortOrder: index,
        })),
      }),
    );
  }

  const primaryActions: Array<{
    key: string;
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'secondary';
  }> = [];

  if (data) {
    if (data.primaryAction === 'RESERVE' && canReserve) {
      primaryActions.push({
        key: 'reserve',
        label: 'Повторить резерв',
        onClick: () =>
          void run(async () => {
            await getApiClient().reserveOrder(organizationId, storeId, orderId);
          }),
      });
    }
    if (data.primaryAction === 'CLAIM' && canClaim) {
      primaryActions.push({
        key: 'claim',
        label: 'Взять в работу',
        onClick: () =>
          void run(async () => {
            const client = getApiClient();
            await client.claimOrder(organizationId, storeId, orderId);
            let fresh = await client.getWorkOrder(organizationId, storeId, orderId);
            if (fresh.order.status === 'CONFIRMED') {
              await client.reserveOrder(organizationId, storeId, orderId);
              fresh = await client.getWorkOrder(organizationId, storeId, orderId);
            }
            if (
              fresh.order.status === 'RESERVED' ||
              fresh.order.status === 'PARTIALLY_RESERVED'
            ) {
              await client.startOrderPreparation(organizationId, storeId, orderId);
            }
          }),
      });
    }
    if (data.primaryAction === 'START_PREPARATION' && canPrepare) {
      primaryActions.push({
        key: 'start',
        label: 'Начать сборку',
        onClick: () =>
          void run(async () => {
            await getApiClient().startOrderPreparation(organizationId, storeId, orderId);
          }),
      });
    }
    const phase = resolveOrderPhase(
      {
        status: data.order.status,
        type: data.order.type,
        hasActiveAssignment: data.order.hasActiveAssignment,
      },
      deliveryHint
        ? { status: deliveryHint.status, handedOverAt: null }
        : null,
    );
    if (
      phase === 'IN_WORK' &&
      data.order.status === 'IN_PREPARATION' &&
      auth.hasPermission('orders:prepare')
    ) {
      primaryActions.push({
        key: 'ready',
        label: 'Готов',
        onClick: () => setConfirmReady(true),
      });
    }
    if (
      phase === 'READY' &&
      data.primaryAction === 'CREATE_SALE' &&
      auth.hasPermission('sales:create')
    ) {
      primaryActions.push({
        key: 'sale',
        label: 'Оформить продажу',
        onClick: () => router.push(`${base}/sales/new?fromOrder=${orderId}`),
        variant: 'secondary',
      });
    }
  }

  if (!canRead) {
    return (
      <main>
        <PageContainer>
          <ErrorState message="Доступ запрещён: требуется workspace:read или orders:read." />
        </PageContainer>
      </main>
    );
  }

  const actionButtons = (
    <>
      {primaryActions.map((btn) => (
        <Button
          key={btn.key}
          type="button"
          variant={btn.variant ?? 'primary'}
          disabled={busy}
          onClick={btn.onClick}
        >
          {btn.label}
        </Button>
      ))}
      <Button type="button" variant="secondary" disabled={busy} onClick={() => void load()}>
        Обновить
      </Button>
    </>
  );

  return (
    <main className="work-order-page">
      <PageContainer>
        <PageHeader
          title="Рабочий заказ"
          refCode={data?.order.number}
          description={data ? `${data.order.status} · ${data.order.occasion}` : undefined}
          breadcrumbs={[
            { label: 'Обзор', href: `${base}/home` },
            { label: data?.order.customerNameSnapshot?.trim() || 'Сборка' },
          ]}
          actions={
            <div className="work-order-actions work-order-actions--desktop">
              {data ? (
                <Link href={`${base}/orders/${orderId}`}>
                  <Button type="button" variant="ghost">
                    Карточка заказа
                  </Button>
                </Link>
              ) : null}
              {actionButtons}
            </div>
          }
        />

        {loading ? <LoadingState message="Загрузка рабочего заказа…" /> : null}
        {error ? <ErrorState message={error} /> : null}
        {info ? <InlineAlert tone="warning">{info}</InlineAlert> : null}

        {!loading && data ? (
          <>
            <OrderJourneyTree
              basePath={base}
              order={{
                id: data.order.id,
                number: data.order.number,
                type: data.order.type,
                status: data.order.status,
                hasActiveAssignment: data.order.hasActiveAssignment,
                primaryAction: data.primaryAction,
              }}
              delivery={
                deliveryHint
                  ? {
                      id: deliveryHint.id,
                      number: deliveryHint.number,
                      status: deliveryHint.status,
                      handedOverAt: deliveryHint.handedOverAt ?? null,
                    }
                  : null
              }
              sale={linkedSale}
              links={{
                order: true,
                delivery: canReadDelivery,
                sale: canReadSales,
              }}
              permissions={{ createSale: auth.hasPermission('sales:create') }}
            />
          <div className="work-order-layout">
            <div className="work-order-layout__main">
              <Section>
                <Card title="Заказ">
                  <div className="meta-row">
                    <span className="status-badge status-badge--info">
                      {orderPhaseLabel(
                        resolveOrderPhase(
                          {
                            status: data.order.status,
                            type: data.order.type,
                            hasActiveAssignment: data.order.hasActiveAssignment,
                          },
                          deliveryHint
                            ? { status: deliveryHint.status, handedOverAt: null }
                            : null,
                        ),
                        data.order,
                      )}
                    </span>
                    <span className={`urgency-badge urgency-badge--${data.urgency.toLowerCase()}`}>
                      {data.urgency}
                    </span>
                    <CountdownBadge
                      readyAt={data.order.readyAt}
                      serverNow={data.serverNow}
                      clientCapturedAt={capturedAt}
                    />
                    <span>v{data.version}</span>
                  </div>
                  <p style={{ margin: '12px 0 0' }}>
                    {[data.order.customerNameSnapshot, data.order.type, data.order.occasion]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {data.order.hasDeficit ? (
                    <InlineAlert tone="warning" title="Нехватка">
                      В плане есть дефицит — проверьте доступность перед отметкой готовности.
                    </InlineAlert>
                  ) : null}
                  {deliveryHint ? (
                    <div style={{ marginTop: 12 }}>
                      <div className="meta-row">
                        <span>Доставка</span>
                        <StatusBadge status={deliveryHint.status} />
                        <span>{deliveryHint.status}</span>
                        {deliveryHint.status === 'READY_FOR_DISPATCH' ? (
                          <span className="status-badge status-badge--info">к отправке</span>
                        ) : null}
                      </div>
                      <p className="order-card__sub">
                        Окно:{' '}
                        {new Date(deliveryHint.windowStart).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        –
                        {new Date(deliveryHint.windowEnd).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        ·{' '}
                        <Link href={`${base}/deliveries/${deliveryHint.id}`}>
                          {deliveryHint.number}
                        </Link>
                      </p>
                    </div>
                  ) : data.order.type === 'DELIVERY' && canReadDelivery ? (
                    <p className="order-card__sub" style={{ marginTop: 12 }}>
                      Доставка ещё не создана.
                    </p>
                  ) : null}
                </Card>
              </Section>

              <Section>
                <Card title="Плановый состав">
                  <ul className="list-stack">
                    {data.plannedLines.map((line) => (
                      <li key={line.id}>
                        <strong>
                          {line.itemName} ({line.itemCode})
                        </strong>
                        <div className="meta-row">
                          <span>План {line.plannedQuantity}</span>
                          <span>Зарезервировано {line.reservedQuantity}</span>
                          <span>Доступно {line.availableQuantity}</span>
                          {Number(line.deficitQuantity) > 0 ? (
                            <span className="status-badge status-badge--warning">
                              Дефицит {line.deficitQuantity}
                            </span>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </Card>
              </Section>

              <Section>
                <Card title="Фактический состав">
                  <form className="stack-form" onSubmit={saveActual}>
                    {drafts.map((line, index) => (
                      <div key={`${line.itemId}-${index}`} className="actual-line-editor">
                        <strong>
                          {line.itemName} ({line.itemCode})
                        </strong>
                        <label>
                          Количество
                          <Input
                            value={line.actualQuantity}
                            onChange={(e) => {
                              const value = e.target.value;
                              setDrafts((prev) =>
                                prev.map((row, i) =>
                                  i === index ? { ...row, actualQuantity: value } : row,
                                ),
                              );
                            }}
                          />
                        </label>
                        <label>
                          Партия
                          <Input
                            value={line.batchId}
                            onChange={(e) => {
                              const value = e.target.value;
                              setDrafts((prev) =>
                                prev.map((row, i) =>
                                  i === index ? { ...row, batchId: value } : row,
                                ),
                              );
                            }}
                          />
                        </label>
                        <label>
                          Комментарий
                          <Input
                            value={line.comment}
                            onChange={(e) => {
                              const value = e.target.value;
                              setDrafts((prev) =>
                                prev.map((row, i) =>
                                  i === index ? { ...row, comment: value } : row,
                                ),
                              );
                            }}
                          />
                        </label>
                      </div>
                    ))}
                    {auth.hasPermission('orders:prepare') ? (
                      <Button type="submit" disabled={busy || drafts.length === 0}>
                        Сохранить фактический состав
                      </Button>
                    ) : null}
                  </form>
                </Card>
              </Section>

              <Section>
                <Card title="Оплата">
                  <div className="meta-row">
                    <span>План {data.paymentSummary.plannedPrice ?? '—'}</span>
                    <span>Выделено на заказ {data.paymentSummary.allocatedToOrder}</span>
                    {data.paymentSummary.saleId ? (
                      <span>
                        Продажа {data.paymentSummary.saleStatus} ·{' '}
                        {data.paymentSummary.saleNetAmount ?? '—'}
                      </span>
                    ) : null}
                  </div>
                  <div className="meta-row" style={{ marginTop: 12 }}>
                    <Link href={`${base}/payments`}>Оплаты</Link>
                    {data.paymentSummary.saleId ? (
                      <Link href={`${base}/sales/${data.paymentSummary.saleId}`}>Открыть продажу</Link>
                    ) : null}
                    {data.order.status === 'READY' && !data.paymentSummary.saleId ? (
                      <Link href={`${base}/sales/new?fromOrder=${orderId}`}>Создать продажу</Link>
                    ) : null}
                  </div>
                </Card>
              </Section>
            </div>

            <aside className="work-order-layout__aside" aria-label="Действия">
              <Card title="Действия">
                <div className="stack-form">{actionButtons}</div>
              </Card>
            </aside>
          </div>
          </>
        ) : null}
      </PageContainer>

      <StickyActionBar>{actionButtons}</StickyActionBar>

      <ConfirmDialog
        open={confirmReady}
        title="Отметить заказ готовым?"
        message="Подтвердите, что фактический состав завершён, перед отметкой готовности."
        confirmLabel="Отметить готовым"
        busy={busy}
        onCancel={() => setConfirmReady(false)}
        onConfirm={() => {
          setConfirmReady(false);
          void run(() => getApiClient().markOrderReady(organizationId, storeId, orderId));
        }}
      />
      <ConfirmDialog
        open={confirmRelease}
        title="Освободить назначение?"
        message="Это снимает активное назначение флориста с заказа."
        confirmLabel="Освободить"
        destructive
        busy={busy}
        onCancel={() => setConfirmRelease(false)}
        onConfirm={() => {
          setConfirmRelease(false);
          void run(() =>
            getApiClient().releaseAssignment(organizationId, storeId, orderId, {
              reason: 'Released from work order',
            }),
          );
        }}
      />
    </main>
  );
}
