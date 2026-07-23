'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import {
  ApiClientError,
  type CompositionReplaceReason,
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

const REPLACE_REASONS: CompositionReplaceReason[] = [
  'OUT_OF_STOCK',
  'QUALITY',
  'CUSTOMER_REQUEST',
  'FLORIST_DECISION',
  'OTHER',
];

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
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [fromItemId, setFromItemId] = useState('');
  const [toItemId, setToItemId] = useState('');
  const [replaceQty, setReplaceQty] = useState('1');
  const [replaceReason, setReplaceReason] = useState<CompositionReplaceReason>('OUT_OF_STOCK');
  const [replaceComment, setReplaceComment] = useState('');
  const [catalog, setCatalog] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [deliveryHint, setDeliveryHint] = useState<{
    id: string;
    number: string;
    status: string;
    windowStart: string;
    windowEnd: string;
  } | null>(null);

  const canRead = auth.hasPermission('workspace:read') || auth.hasPermission('orders:read');
  const canReadDelivery = auth.hasPermission('delivery:read');

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
      const [workOrder, items, deliveries] = await Promise.all([
        client.getWorkOrder(organizationId, storeId, orderId),
        client.listItems(organizationId, { pageSize: 100, status: 'ACTIVE' }),
        canReadDelivery
          ? client.listDeliveries(organizationId, storeId)
          : Promise.resolve([]),
      ]);
      setData(workOrder);
      setCapturedAt(Date.now());
      syncDrafts(workOrder);
      setCatalog(items.items);
      setFromItemId((prev) => prev || workOrder.plannedLines[0]?.itemId || '');
      setToItemId((prev) => prev || items.items[0]?.id || '');
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
            }
          : null,
      );
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось загрузить рабочий заказ');
    } finally {
      setLoading(false);
    }
  }, [organizationId, storeId, orderId, syncDrafts, canReadDelivery]);

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

  async function submitReplace(event: FormEvent) {
    event.preventDefault();
    if (!data) return;
    await run(async () => {
      await getApiClient().replaceCompositionItem(organizationId, storeId, orderId, {
        expectedVersion: data.version,
        fromItemId,
        toItemId,
        quantity: replaceQty,
        reason: replaceReason,
        comment: replaceComment || null,
      });
      setReplaceOpen(false);
      setReplaceComment('');
    });
  }

  const primaryActions: Array<{
    key: string;
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'secondary';
  }> = [];

  if (data) {
    const action = data.primaryAction;
    if (action === 'CLAIM' || auth.hasPermission('orders:assign')) {
      if (!data.order.hasActiveAssignment) {
        primaryActions.push({
          key: 'claim',
          label: 'Взять',
          onClick: () => void run(() => getApiClient().claimOrder(organizationId, storeId, orderId)),
        });
      }
    }
    if (
      action === 'START_PREPARATION' ||
      data.order.status === 'RESERVED' ||
      data.order.status === 'PARTIALLY_RESERVED'
    ) {
      if (auth.hasPermission('orders:prepare')) {
        primaryActions.push({
          key: 'start',
          label: 'Начать подготовку',
          onClick: () =>
            void run(() => getApiClient().startOrderPreparation(organizationId, storeId, orderId)),
        });
      }
    }
    if (auth.hasPermission('orders:prepare') && data.order.status === 'IN_PREPARATION') {
      primaryActions.push({
        key: 'ready',
        label: 'Отметить готовым',
        onClick: () => setConfirmReady(true),
      });
    }
    if (data.order.status === 'READY' && action === 'CREATE_SALE') {
      primaryActions.push({
        key: 'sale',
        label: 'Создать продажу',
        onClick: () => router.push(`${base}/sales/new?fromOrder=${orderId}`),
      });
    }
    if (auth.hasPermission('orders:assign') && data.order.hasActiveAssignment) {
      primaryActions.push({
        key: 'release',
        label: 'Освободить',
        variant: 'secondary',
        onClick: () => setConfirmRelease(true),
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
          title={data ? `Рабочий заказ ${data.order.number}` : 'Рабочий заказ'}
          description={data ? `${data.order.status} · ${data.order.occasion}` : 'Загрузка…'}
          breadcrumbs={[
            { label: 'Сегодня', href: `${base}/today` },
            { label: data?.order.number ?? 'Рабочий заказ' },
          ]}
          actions={<div className="work-order-actions work-order-actions--desktop">{actionButtons}</div>}
        />

        {loading ? <LoadingState message="Загрузка рабочего заказа…" /> : null}
        {error ? <ErrorState message={error} /> : null}
        {info ? <InlineAlert tone="warning">{info}</InlineAlert> : null}

        {!loading && data ? (
          <div className="work-order-layout">
            <div className="work-order-layout__main">
              <Section>
                <Card title="Заказ">
                  <div className="meta-row">
                    <StatusBadge status={data.order.status} />
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
                  {auth.hasPermission('orders:prepare') ? (
                    <div style={{ marginTop: 12 }}>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => setReplaceOpen((v) => !v)}
                      >
                        Заменить позицию
                      </Button>
                    </div>
                  ) : null}
                  {replaceOpen ? (
                    <form className="stack-form" style={{ marginTop: 16 }} onSubmit={submitReplace}>
                      <label>
                        Из позиции
                        <select
                          value={fromItemId}
                          onChange={(e) => setFromItemId(e.target.value)}
                          required
                        >
                          {data.plannedLines.map((line) => (
                            <option key={line.itemId} value={line.itemId}>
                              {line.itemName}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        В позицию
                        <select value={toItemId} onChange={(e) => setToItemId(e.target.value)} required>
                          {catalog.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name} ({item.code})
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Количество
                        <Input
                          value={replaceQty}
                          onChange={(e) => setReplaceQty(e.target.value)}
                          required
                        />
                      </label>
                      <label>
                        Причина
                        <select
                          value={replaceReason}
                          onChange={(e) =>
                            setReplaceReason(e.target.value as CompositionReplaceReason)
                          }
                        >
                          {REPLACE_REASONS.map((reason) => (
                            <option key={reason} value={reason}>
                              {reason}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Комментарий
                        <Input
                          value={replaceComment}
                          onChange={(e) => setReplaceComment(e.target.value)}
                        />
                      </label>
                      <Button type="submit" disabled={busy}>
                        Применить замену
                      </Button>
                    </form>
                  ) : null}
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
