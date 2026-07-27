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
  START_PREPARATION: 'Начать',
  EDIT_ACTUAL: 'Факт',
  MARK_READY: 'Готово',
  CREATE_SALE: 'Продажа',
  VIEW: 'Открыть',
  NONE: 'Открыть',
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
  const canCreateSale = auth.hasPermission('sales:create');
  const canCreateOrder = auth.hasPermission('orders:create');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const today = await getApiClient().getWorkspaceToday(organizationId, storeId);
      setData(today);
      setCapturedAt(Date.now());
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : 'Не удалось загрузить смену',
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

  function filterHref(filter: string) {
    return `${base}/orders?filter=${encodeURIComponent(filter)}`;
  }

  const dateLabel = useMemo(
    () =>
      new Date().toLocaleDateString('ru-RU', {
        weekday: 'short',
        day: 'numeric',
        month: 'long',
      }),
    [],
  );

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
    return merged
      .filter((card) => {
        if (seen.has(card.id)) return false;
        seen.add(card.id);
        return true;
      })
      .slice(0, 8);
  }, [data]);

  const hasAttention =
    !!data &&
    (data.attentionItems.length > 0 ||
      data.lowStockWarnings.length > 0 ||
      data.counters.unassigned.count > 0 ||
      data.counters.partiallyReserved.count > 0);

  if (!canRead) {
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
            <h1 className="hub-header__title">Смена</h1>
            <p className="hub-header__subtitle">Очередь заказов и быстрые действия</p>
          </div>
          <div className="page-header__actions">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void load()}>
              Обновить
            </Button>
          </div>
        </header>

        {loading ? <LoadingState message="Загрузка…" /> : null}
        {error ? <ErrorState message={error} /> : null}
        {message ? <InlineAlert tone="info">{message}</InlineAlert> : null}

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
          </div>
        </Section>

        {!loading && !error && data ? (
          <>
            <Section>
              <div className="metric-grid metric-grid--essential">
                <MetricCard
                  label="Просрочены"
                  value={data.counters.overdue.count}
                  href={filterHref(data.counters.overdue.filterLink)}
                  tone="danger"
                  tint={1}
                />
                <MetricCard
                  label="Скоро"
                  value={data.counters.soon.count}
                  href={filterHref(data.counters.soon.filterLink)}
                  tone="warning"
                  tint={2}
                />
                <MetricCard
                  label="В работе"
                  value={data.counters.inPreparation.count}
                  href={filterHref(data.counters.inPreparation.filterLink)}
                  tint={3}
                />
                <MetricCard
                  label="Готовы"
                  value={data.counters.ready.count}
                  href={filterHref(data.counters.ready.filterLink)}
                  tone="success"
                  tint={4}
                />
              </div>
            </Section>

            {hasAttention ? (
              <Section>
                <Card title="Внимание">
                  <div className="attention-list">
                    {data.counters.unassigned.count > 0 ? (
                      <InlineAlert tone="info" title="Без назначения">
                        {data.counters.unassigned.count} заказ(ов).{' '}
                        <Link href={filterHref(data.counters.unassigned.filterLink)}>Открыть</Link>
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
                    {data.attentionItems.slice(0, 3).map((item) => (
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
                    {data.lowStockWarnings.slice(0, 2).map((warning) => (
                      <InlineAlert
                        key={`${warning.itemId}-${warning.warehouseId}`}
                        tone="warning"
                        title={`Мало: ${warning.itemName}`}
                      >
                        {warning.availableQuantity} из {warning.threshold}.{' '}
                        <Link href={`${base}/stock`}>Склад</Link>
                      </InlineAlert>
                    ))}
                  </div>
                </Card>
              </Section>
            ) : null}

            <Section>
              <Card title="Очередь">
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
                            serverNow={data.serverNow}
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
                </div>
              </Card>
            </Section>
          </>
        ) : null}
      </PageContainer>
    </main>
  );
}
