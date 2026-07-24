'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Button, Card } from '@flower/ui';
import { ApiClientError, type WorkspaceTodayDto } from '@flower/api-client';
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
} from '@/components/workspace/workspace-ui';

const PRIMARY_ACTION_LABEL: Record<string, string> = {
  CLAIM: 'Взять',
  START_PREPARATION: 'Начать подготовку',
  EDIT_ACTUAL: 'Изменить факт',
  MARK_READY: 'Отметить готовым',
  CREATE_SALE: 'Создать продажу',
  VIEW: 'Открыть',
  NONE: 'Открыть',
};

type QuickAction = {
  id: string;
  label: string;
  description: string;
  href?: string;
  onClick?: () => void;
  permission?: string | string[];
  tone?: 'accent' | 'muted';
};

export default function TodayWorkspacePage() {
  const params = useParams<{ organizationId: string; storeId: string }>();
  const auth = useAuth();
  const router = useRouter();
  const { organizationId, storeId } = params;
  const base = `/organizations/${organizationId}/stores/${storeId}`;

  const [data, setData] = useState<WorkspaceTodayDto | null>(null);
  const [capturedAt, setCapturedAt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const canRead = auth.hasPermission('workspace:read') || auth.hasPermission('orders:read');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const today = await getApiClient().getWorkspaceToday(organizationId, storeId);
      setData(today);
      setCapturedAt(Date.now());
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : 'Не удалось загрузить рабочее пространство',
      );
    } finally {
      setLoading(false);
    }
  }, [organizationId, storeId]);

  useEffect(() => {
    if (!canRead) return;
    void load();
  }, [canRead, load]);

  async function runPrimary(orderId: string, action: string) {
    const client = getApiClient();
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      if (action === 'CLAIM') {
        await client.claimOrder(organizationId, storeId, orderId);
        router.push(`${base}/work-orders/${orderId}`);
        return;
      }
      if (action === 'START_PREPARATION') {
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

  async function claimNext() {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const result = await getApiClient().claimNextOrder(organizationId, storeId);
      if (result.code === 'NO_ORDER_AVAILABLE' || !result.order) {
        setMessage('Нет заказа для взятия в работу.');
        return;
      }
      router.push(`${base}/work-orders/${result.order.id}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось взять следующий заказ');
    } finally {
      setBusy(false);
    }
  }

  function filterHref(filter: string) {
    return `${base}/orders?filter=${encodeURIComponent(filter)}`;
  }

  const canClaimNext =
    auth.hasPermission('orders:assign') && auth.hasPermission('orders:prepare');

  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString('ru-RU', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
    [],
  );

  const quickActions = useMemo((): QuickAction[] => {
    const actions: QuickAction[] = [
      {
        id: 'sale',
        label: 'Новая продажа',
        description: 'Выдача и оплата в магазине',
        href: `${base}/sales/new`,
        permission: 'sales:create',
        tone: 'accent',
      },
      {
        id: 'order',
        label: 'Новый заказ',
        description: 'К времени: самовывоз или доставка',
        href: `${base}/orders`,
        permission: 'orders:create',
      },
      {
        id: 'supply',
        label: 'Поставка',
        description: 'Приёмка и поставки',
        href: `${base}/supplies`,
        permission: 'supply:read',
      },
      {
        id: 'delivery',
        label: 'Доставка',
        description: 'Маршруты и курьеры',
        href: `${base}/deliveries`,
        permission: 'delivery:read',
      },
      {
        id: 'stock',
        label: 'Склад',
        description: 'Остатки магазина',
        href: `${base}/stock`,
        permission: 'inventory:read',
      },
      {
        id: 'claim',
        label: 'Взять следующий',
        description: 'Следующий заказ в работу',
        onClick: () => void claimNext(),
        permission: ['orders:assign', 'orders:prepare'],
      },
    ];

    return actions.filter((action) => {
      if (!action.permission) return true;
      if (Array.isArray(action.permission)) {
        return action.permission.every((code) => auth.hasPermission(code));
      }
      return auth.hasPermission(action.permission);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth, base]);

  const priorityQueue = useMemo(() => {
    if (!data) return [];
    const seen = new Set<string>();
    const merged = [
      ...data.sections.overdue,
      ...data.sections.soon,
      ...data.sections.unassigned,
      ...data.sections.inPreparation,
      ...data.sections.ready,
    ];
    return merged.filter((card) => {
      if (seen.has(card.id)) return false;
      seen.add(card.id);
      return true;
    }).slice(0, 8);
  }, [data]);

  if (!canRead) {
    return (
      <main>
        <PageContainer>
          <ErrorState message="Доступ запрещён: требуется доступ к рабочему месту или заказам." />
        </PageContainer>
      </main>
    );
  }

  return (
    <main>
      <PageContainer>
        <header className="hub-header">
          <div>
            <p className="hub-header__date">{todayLabel}</p>
            <h1 className="hub-header__title">Сегодня</h1>
            <p className="hub-header__subtitle">
              Единая панель магазина: продажа, заказы, поставки и очередь на смену.
            </p>
          </div>
          <div className="page-header__actions">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void load()}>
              Обновить
            </Button>
          </div>
        </header>

        {loading ? <LoadingState message="Загрузка панели…" /> : null}
        {error ? <ErrorState message={error} /> : null}
        {message ? <InlineAlert tone="info">{message}</InlineAlert> : null}

        <Section>
          <div className="hub-quick">
            {quickActions.map((action) => {
              const className =
                action.tone === 'accent' ? 'hub-quick__card hub-quick__card--accent' : 'hub-quick__card';
              if (action.href) {
                return (
                  <Link key={action.id} href={action.href} className={className}>
                    <strong>{action.label}</strong>
                    <span>{action.description}</span>
                  </Link>
                );
              }
              return (
                <button
                  key={action.id}
                  type="button"
                  className={className}
                  disabled={busy}
                  onClick={action.onClick}
                >
                  <strong>{action.label}</strong>
                  <span>{action.description}</span>
                </button>
              );
            })}
          </div>
        </Section>

        {!loading && !error && data ? (
          <>
            <Section>
              <div className="metric-grid metric-grid--essential">
                <MetricCard
                  label="Просрочены"
                  value={data.counters.overdue.count}
                  hint="Закрыть в первую очередь"
                  href={filterHref(data.counters.overdue.filterLink)}
                  tone="danger"
                  tint={1}
                />
                <MetricCard
                  label="Скоро"
                  value={data.counters.soon.count}
                  hint="Готовность в ближайшие часы"
                  href={filterHref(data.counters.soon.filterLink)}
                  tone="warning"
                  tint={2}
                />
                <MetricCard
                  label="В подготовке"
                  value={data.counters.inPreparation.count}
                  hint="Уже в работе"
                  href={filterHref(data.counters.inPreparation.filterLink)}
                  tint={3}
                />
                <MetricCard
                  label="Готовы"
                  value={data.counters.ready.count}
                  hint="Можно выдавать"
                  href={filterHref(data.counters.ready.filterLink)}
                  tone="success"
                  tint={4}
                />
              </div>
            </Section>

            <div className="hub-layout">
              <Section>
                <Card title="Очередь на смену">
                  {priorityQueue.length === 0 ? (
                    <EmptyState message="На сейчас очередь пуста — можно заняться продажей или поставкой." />
                  ) : (
                    <div className="order-card-list">
                      {priorityQueue.map((card) => (
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
                              serverNow={data.serverNow}
                              clientCapturedAt={capturedAt}
                            />
                          }
                          primaryActionLabel={PRIMARY_ACTION_LABEL[card.primaryAction] ?? 'Открыть'}
                          primaryDisabled={busy}
                          onPrimaryAction={() => void runPrimary(card.id, card.primaryAction)}
                        />
                      ))}
                    </div>
                  )}
                  <div className="hub-card-footer">
                    <Link href={`${base}/orders`}>Все заказы</Link>
                    {canClaimNext ? (
                      <Button type="button" disabled={busy} onClick={() => void claimNext()}>
                        Взять следующий
                      </Button>
                    ) : null}
                  </div>
                </Card>
              </Section>

              <div className="hub-side">
                <Section>
                  <Card title="Требует внимания">
                    {data.attentionItems.length === 0 &&
                    data.lowStockWarnings.length === 0 &&
                    data.counters.unassigned.count === 0 &&
                    data.counters.partiallyReserved.count === 0 ? (
                      <EmptyState message="Критичных отклонений нет." />
                    ) : (
                      <div className="attention-list">
                        {data.counters.unassigned.count > 0 ? (
                          <InlineAlert tone="info" title="Без назначения">
                            {data.counters.unassigned.count} заказ(ов).{' '}
                            <Link href={filterHref(data.counters.unassigned.filterLink)}>
                              Открыть
                            </Link>
                          </InlineAlert>
                        ) : null}
                        {data.counters.partiallyReserved.count > 0 ? (
                          <InlineAlert tone="warning" title="Нехватка состава">
                            {data.counters.partiallyReserved.count} заказ(ов).{' '}
                            <Link href={filterHref(data.counters.partiallyReserved.filterLink)}>
                              Открыть
                            </Link>
                          </InlineAlert>
                        ) : null}
                        {data.attentionItems.slice(0, 4).map((item) => (
                          <AttentionItem
                            key={item.id}
                            severity={item.severity}
                            title={item.title}
                            reason={item.reason}
                            recommendedAction={item.recommendedAction}
                            ageMinutes={item.ageMinutes}
                            href={
                              item.entityType === 'ORDER'
                                ? `${base}/work-orders/${item.entityId}`
                                : item.filterLink
                                  ? filterHref(item.filterLink)
                                  : null
                            }
                          />
                        ))}
                        {data.lowStockWarnings.slice(0, 3).map((warning) => (
                          <InlineAlert
                            key={`${warning.itemId}-${warning.warehouseId}`}
                            tone="warning"
                            title={`Мало: ${warning.itemName}`}
                          >
                            Доступно {warning.availableQuantity} (порог {warning.threshold}).{' '}
                            <Link href={`${base}/stock`}>Склад</Link>
                          </InlineAlert>
                        ))}
                      </div>
                    )}
                  </Card>
                </Section>

                <Section>
                  <Card title="Ещё разделы">
                    <ul className="hub-links">
                      <li>
                        <Link href={`${base}/sales`}>Продажи и история</Link>
                      </li>
                      <li>
                        <Link href={`${base}/payments`}>Оплаты</Link>
                      </li>
                      {auth.hasPermission('master-data:read') ? (
                        <li>
                          <Link href={`/organizations/${organizationId}/master-data`}>
                            Справочники
                          </Link>
                        </li>
                      ) : null}
                      {auth.hasPermission('users:read') ? (
                        <li>
                          <Link href={`/organizations/${organizationId}/users`}>Настройки</Link>
                        </li>
                      ) : null}
                    </ul>
                  </Card>
                </Section>
              </div>
            </div>
          </>
        ) : null}
      </PageContainer>
    </main>
  );
}
