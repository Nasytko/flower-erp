'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Button, Card } from '@flower/ui';
import {
  ApiClientError,
  type DeliveryBoardDto,
  type OperationsBoardDto,
  type WorkspaceTodayDto,
} from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { PageContainer } from '@/components/layout/page-container';
import { Section } from '@/components/layout/section';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/states';
import {
  AttentionItem,
  CountdownBadge,
  InlineAlert,
  MetricCard,
  OrderCard,
  SegmentedControl,
} from '@/components/workspace/workspace-ui';
import { BOARD_SECTION_LABELS, formatWindow, todayIsoDate } from '@/lib/delivery-labels';
import { resolveAttentionHref } from '@/lib/attention-ui';
import {
  orderPhaseLabel,
  resolveOrderPhase,
  type OrderPhase,
} from '@/lib/order-ui';

type DeliverySectionKey = keyof DeliveryBoardDto['sections'];

const PRIMARY_ACTION_LABEL: Record<string, string> = {
  RESERVE: 'Резерв',
  START_PREPARATION: 'В работу',
  MARK_READY: 'Готов',
  CREATE_SALE: 'Продажа',
  VIEW: 'Открыть',
  NONE: 'Открыть',
};

const DELIVERY_KPI_SECTIONS: Array<{
  key: DeliverySectionKey;
  label: string;
  tone?: 'default' | 'warning' | 'danger' | 'success';
  tint?: 1 | 2 | 3 | 4;
}> = [
  { key: 'problems', label: 'Проблемы', tone: 'danger', tint: 1 },
  { key: 'withoutCourier', label: 'Без курьера', tone: 'warning', tint: 2 },
  { key: 'inTransit', label: 'В пути', tint: 3 },
  { key: 'delivered', label: 'Доставлены', tone: 'success', tint: 4 },
];

const HOME_BOARD_SECTIONS: DeliverySectionKey[] = [
  'problems',
  'withoutCourier',
  'inTransit',
];

const PHASE_TONE: Record<OrderPhase, string> = {
  DRAFT: 'neutral',
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

export default function StoreHomePage() {
  const params = useParams<{ organizationId: string; storeId: string }>();
  const auth = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') === 'queue' ? 'queue' : 'overview';
  const { organizationId, storeId } = params;
  const base = `/organizations/${organizationId}/stores/${storeId}`;

  const [workspace, setWorkspace] = useState<WorkspaceTodayDto | null>(null);
  const [operations, setOperations] = useState<OperationsBoardDto | null>(null);
  const [deliveryBoard, setDeliveryBoard] = useState<DeliveryBoardDto | null>(null);
  const [capturedAt, setCapturedAt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const canWorkspace = auth.hasPermission('workspace:read') || auth.hasPermission('orders:read');
  const canOperations = auth.hasPermission('operations:read');
  const canDelivery = auth.hasPermission('delivery:read');
  const canAccess = canWorkspace || canOperations || canDelivery;
  const courierOnly = canDelivery && !canWorkspace && !canOperations;
  const showOverviewSections = tab === 'overview' && !courierOnly;

  const canCreateSale = auth.hasPermission('sales:create');
  const canCreateOrder = auth.hasPermission('orders:create');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = getApiClient();
      const today = todayIsoDate();
      const [ws, ops, delivery] = await Promise.all([
        canWorkspace
          ? client.getWorkspaceToday(organizationId, storeId).catch(() => null)
          : Promise.resolve(null),
        canOperations
          ? client.getOperations(organizationId, storeId).catch(() => null)
          : Promise.resolve(null),
        canDelivery
          ? client.getDeliveryBoard(organizationId, storeId, today).catch(() => null)
          : Promise.resolve(null),
      ]);
      setWorkspace(ws);
      setOperations(ops);
      setDeliveryBoard(delivery);
      setCapturedAt(Date.now());
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось загрузить обзор');
    } finally {
      setLoading(false);
    }
  }, [organizationId, storeId, canWorkspace, canOperations, canDelivery]);

  useEffect(() => {
    if (!canAccess) return;
    void load();
  }, [canAccess, load]);

  const dateLabel = useMemo(
    () =>
      new Date().toLocaleDateString('ru-RU', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
    [],
  );

  function filterHref(filter: string) {
    return `${base}/orders?filter=${encodeURIComponent(filter)}`;
  }

  function setTab(next: string) {
    const href =
      next === 'queue' ? `${base}/home?tab=queue` : `${base}/home`;
    router.replace(href);
  }

  function lifecycleFilterHref(phase: string) {
    if (phase === 'HANDED_OFF') {
      return `${base}/orders?phase=HANDED_OFF_TODAY`;
    }
    return `${base}/orders?phase=${encodeURIComponent(phase)}`;
  }

  const priorityQueue = useMemo(() => {
    if (!workspace) return [];
    const seen = new Set<string>();
    const merged = [
      ...workspace.sections.overdue,
      ...workspace.sections.soon,
      ...workspace.sections.unassigned,
      ...workspace.sections.inPreparation,
      ...workspace.sections.ready,
    ];
    return merged
      .filter((card) => {
        if (seen.has(card.id)) return false;
        seen.add(card.id);
        return true;
      })
      .slice(0, tab === 'queue' ? 12 : 6);
  }, [workspace, tab]);

  const attentionItems = useMemo(() => {
    const seen = new Set<string>();
    const items = [
      ...(workspace?.attentionItems ?? []),
      ...(operations?.attentionItems ?? []),
    ];
    return items.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [workspace, operations]);

  async function runPrimary(orderId: string, action: string) {
    const client = getApiClient();
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      if (action === 'RESERVE') {
        await client.reserveOrder(organizationId, storeId, orderId);
      } else if (action === 'START_PREPARATION') {
        await client.startOrderPreparation(organizationId, storeId, orderId);
      } else if (action === 'MARK_READY') {
        await client.markOrderReady(organizationId, storeId, orderId);
      } else if (action === 'CREATE_SALE') {
        router.push(`${base}/sales/new?fromOrder=${orderId}`);
        return;
      } else if (action === 'EDIT_ACTUAL' || action === 'VIEW' || action === 'NONE') {
        router.push(`${base}/work-orders/${orderId}`);
        return;
      }
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Действие не выполнено');
    } finally {
      setBusy(false);
    }
  }

  function attentionHref(item: {
    entityType: string;
    entityId: string;
    filterLink?: string | null;
    code?: string;
  }): string | null {
    return resolveAttentionHref(base, item, filterHref);
  }

  if (!canAccess) {
    return (
      <main>
        <PageContainer>
          <ErrorState message="Доступ запрещён." />
        </PageContainer>
      </main>
    );
  }

  return (
    <main>
      <PageContainer>
        <header className="hub-header">
          <div>
            <p className="hub-header__date">{dateLabel}</p>
            <h1 className="hub-header__title">
              {courierOnly ? 'Доставки' : tab === 'queue' ? 'Очередь' : 'Обзор'}
            </h1>
            <p className="hub-header__subtitle">
              {courierOnly
                ? 'Доставки на сегодня'
                : tab === 'queue'
                  ? 'Заказы в работе — быстрые действия'
                  : 'KPI по этапам заказа, доски на сегодня'}
            </p>
          </div>
          <div className="page-header__actions">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void load()}>
              Обновить
            </Button>
          </div>
        </header>

        {!courierOnly && canWorkspace ? (
          <Section>
            <SegmentedControl
              ariaLabel="Режим обзора"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'overview', label: 'Обзор' },
                { value: 'queue', label: 'Очередь' },
              ]}
            />
          </Section>
        ) : null}

        {loading ? <LoadingState message="Загрузка…" /> : null}
        {error ? <ErrorState message={error} /> : null}
        {message ? <InlineAlert tone="info">{message}</InlineAlert> : null}

        {!loading && !error ? (
          <>
            <Section>
              <div className="hub-quick hub-quick--compact">
                {canCreateSale ? (
                  <Link href={`${base}/sales/new`} className="hub-quick__card hub-quick__card--accent">
                    <strong>Новая продажа</strong>
                  </Link>
                ) : null}
                {canCreateOrder ? (
                  <Link href={`${base}/orders`} className="hub-quick__card">
                    <strong>Новый заказ</strong>
                  </Link>
                ) : null}
                {canDelivery ? (
                  <Link href={`${base}/deliveries`} className="hub-quick__card">
                    <strong>Доска доставок</strong>
                  </Link>
                ) : null}
                {canOperations ? (
                  <Link href={`${base}/operations`} className="hub-quick__card">
                    <strong>Операции</strong>
                  </Link>
                ) : null}
              </div>
            </Section>

            {(workspace || operations) && !courierOnly ? (
              <Section>
                <h2 className="home-section-title">Заказы</h2>
                <div className="metric-grid metric-grid--essential">
                  {workspace ? (
                    <>
                      <MetricCard
                        label="Новые"
                        value={workspace.counters.unassigned.count}
                        href={lifecycleFilterHref('NEW')}
                        tint={1}
                      />
                      <MetricCard
                        label="В работе"
                        value={
                          workspace.counters.inWork?.count ??
                          workspace.counters.inPreparation.count
                        }
                        href={lifecycleFilterHref('IN_WORK')}
                        tint={2}
                      />
                      <MetricCard
                        label="Готовы"
                        value={workspace.counters.ready.count}
                        href={lifecycleFilterHref('READY')}
                        tone="success"
                        tint={3}
                      />
                      <MetricCard
                        label="Переданы"
                        value={workspace.counters.handedOffToday?.count ?? 0}
                        href={lifecycleFilterHref('HANDED_OFF')}
                        tone="success"
                        tint={4}
                      />
                    </>
                  ) : operations ? (
                    <>
                      <MetricCard
                        label="Новые"
                        value={operations.kpis.ordersToday}
                        href={lifecycleFilterHref('NEW')}
                        tint={1}
                      />
                      <MetricCard
                        label="В работе"
                        value={operations.kpis.inProgress}
                        href={lifecycleFilterHref('IN_WORK')}
                        tint={2}
                      />
                      <MetricCard
                        label="Готовы"
                        value={operations.kpis.ready}
                        tone="success"
                        href={lifecycleFilterHref('READY')}
                        tint={3}
                      />
                      <MetricCard
                        label="Просрочены"
                        value={operations.kpis.overdue}
                        tone="danger"
                        tint={4}
                        href={`${base}/orders`}
                      />
                    </>
                  ) : null}
                </div>
              </Section>
            ) : null}

            {canDelivery && deliveryBoard ? (
              <Section>
                <h2 className="home-section-title">Доставка</h2>
                <div className="metric-grid">
                  {DELIVERY_KPI_SECTIONS.map(({ key, label, tone, tint }) => (
                    <MetricCard
                      key={key}
                      label={label}
                      value={deliveryBoard.sections[key].length}
                      href={`${base}/deliveries`}
                      tone={tone}
                      tint={tint}
                    />
                  ))}
                </div>
              </Section>
            ) : null}

            {showOverviewSections && operations ? (
              <Section>
                <h2 className="home-section-title">Магазин</h2>
                <div className="metric-grid">
                  <MetricCard label="Продажи сегодня" value={operations.kpis.salesToday} href={`${base}/sales`} tint={1} />
                  <MetricCard
                    label="Неоплаченный остаток"
                    value={operations.kpis.unpaidBalance}
                    href={`${base}/payments`}
                    tone="warning"
                    tint={2}
                  />
                  <MetricCard
                    label="Нехватка"
                    value={operations.kpis.shortages}
                    href={`${base}/stock`}
                    tone="warning"
                    tint={3}
                  />
                  <MetricCard
                    label="Приёмки ждут проведения"
                    value={operations.kpis.suppliesAwaitingReceipt}
                    href={`${base}/supplies`}
                    tint={4}
                  />
                </div>
              </Section>
            ) : null}

            {showOverviewSections &&
            (attentionItems.length > 0 ||
              (workspace &&
                (workspace.counters.unassigned.count > 0 ||
                  workspace.counters.partiallyReserved.count > 0))) ? (
              <Section>
                <Card title="Требует внимания">
                  <div className="attention-list">
                    {workspace && workspace.counters.unassigned.count > 0 ? (
                      <InlineAlert tone="info" title="Без назначения">
                        {workspace.counters.unassigned.count} заказ(ов).{' '}
                        <Link href={filterHref(workspace.counters.unassigned.filterLink)}>Открыть</Link>
                      </InlineAlert>
                    ) : null}
                    {workspace && workspace.counters.partiallyReserved.count > 0 ? (
                      <InlineAlert tone="warning" title="Нехватка состава">
                        {workspace.counters.partiallyReserved.count} заказ(ов).{' '}
                        <Link href={filterHref(workspace.counters.partiallyReserved.filterLink)}>
                          Открыть
                        </Link>
                      </InlineAlert>
                    ) : null}
                    {attentionItems.slice(0, 6).map((item) => (
                      <AttentionItem
                        key={item.id}
                        severity={item.severity}
                        title={item.title}
                        reason={item.reason}
                        recommendedAction={item.recommendedAction}
                        ageMinutes={item.ageMinutes}
                        href={attentionHref(item)}
                      />
                    ))}
                  </div>
                </Card>
              </Section>
            ) : null}

            {(canWorkspace && workspace) || (courierOnly && canDelivery && deliveryBoard) ? (
              <Section>
                <div className="home-boards">
                {canWorkspace && workspace && !courierOnly ? (
                  <Card title="Доска заказов">
                    {priorityQueue.length === 0 ? (
                      <EmptyState message="Очередь пуста." />
                    ) : (
                      <div className="order-card-list">
                        {priorityQueue.map((card) => {
                          const boardAction =
                            card.primaryAction === 'CLAIM' ? null : card.primaryAction;
                          return (
                          <OrderCard
                            key={card.id}
                            number={card.number}
                            status={card.status}
                            customerName={card.customerNameSnapshot}
                            occasion={card.occasion}
                            urgency={card.urgency}
                            hasDeficit={card.hasDeficit}
                            href={`${base}/work-orders/${card.id}`}
                            countdown={
                              <CountdownBadge
                                readyAt={card.readyAt}
                                serverNow={workspace.serverNow}
                                clientCapturedAt={capturedAt}
                              />
                            }
                            primaryActionLabel={
                              boardAction
                                ? PRIMARY_ACTION_LABEL[boardAction] ?? 'Открыть'
                                : undefined
                            }
                            primaryDisabled={busy}
                            onPrimaryAction={
                              boardAction
                                ? () => void runPrimary(card.id, boardAction)
                                : undefined
                            }
                          />
                          );
                        })}
                      </div>
                    )}
                    <div className="hub-card-footer">
                      <Link href={`${base}/orders`}>Все заказы</Link>
                      <Link href={`${base}/home?tab=queue`}>Очередь</Link>
                    </div>
                  </Card>
                ) : null}

                {canDelivery && deliveryBoard ? (
                  <Card title="Доска доставок">
                    <div className="home-delivery-sections">
                      {HOME_BOARD_SECTIONS.map((key) => {
                        const cards = deliveryBoard.sections[key].slice(0, 4);
                        if (cards.length === 0) return null;
                        return (
                          <div key={key} className="home-delivery-section">
                            <h3 className="home-delivery-section__title">
                              {BOARD_SECTION_LABELS[key] ?? key}{' '}
                              <span className="home-delivery-section__count">
                                ({deliveryBoard.sections[key].length})
                              </span>
                            </h3>
                            <ul className="list-stack">
                              {cards.map((card) => (
                                <li key={card.id}>
                                  <Link
                                    href={`${base}/deliveries/${card.id}`}
                                    className="delivery-board-card delivery-board-card--compact"
                                  >
                                    <div className="meta-row">
                                      <strong>{card.number}</strong>
                                      <OrderPhaseBadge
                                        phase={resolveOrderPhase(
                                          {
                                            status: card.orderStatus ?? 'DRAFT',
                                            type: 'DELIVERY',
                                          },
                                          {
                                            status: card.status,
                                            handedOverAt: card.handedOverAt,
                                          },
                                        )}
                                        orderType="DELIVERY"
                                      />
                                    </div>
                                    <p className="order-card__sub">
                                      {[
                                        card.orderNumber ? `Заказ ${card.orderNumber}` : null,
                                        formatWindow(card.windowStart, card.windowEnd),
                                        card.displayAddress,
                                      ]
                                        .filter(Boolean)
                                        .join(' · ')}
                                    </p>
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })}
                    </div>
                    {HOME_BOARD_SECTIONS.every(
                      (key) => deliveryBoard.sections[key].length === 0,
                    ) ? (
                      <EmptyState message="На сегодня доставок в активных колонках нет." />
                    ) : null}
                    <div className="hub-card-footer">
                      <Link href={`${base}/deliveries`}>Полная доска</Link>
                      <Link href={`${base}/deliveries/map`}>Карта</Link>
                    </div>
                  </Card>
                ) : null}
              </div>
            </Section>
            ) : null}
          </>
        ) : null}
      </PageContainer>
    </main>
  );
}
