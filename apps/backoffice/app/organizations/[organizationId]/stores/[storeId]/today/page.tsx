'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Button, Card } from '@flower/ui';
import { ApiClientError, type WorkspaceTodayDto } from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
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
      setError(err instanceof ApiClientError ? err.message : 'Не удалось загрузить рабочее пространство');
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

  function sectionCards(
    title: string,
    cards: WorkspaceTodayDto['sections']['soon'],
  ) {
    if (!data) return null;
    return (
      <Section>
        <Card title={title}>
          {cards.length === 0 ? (
            <EmptyState message="Пока ничего нет." />
          ) : (
            <div className="order-card-list">
              {cards.map((card) => (
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
                  primaryActionLabel={PRIMARY_ACTION_LABEL[card.primaryAction] ?? 'Open'}
                  primaryDisabled={busy}
                  onPrimaryAction={() => void runPrimary(card.id, card.primaryAction)}
                />
              ))}
            </div>
          )}
        </Card>
      </Section>
    );
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

  const canClaimNext =
    auth.hasPermission('orders:assign') && auth.hasPermission('orders:prepare');

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Сегодня"
          description="Очередь магазина на сегодня: что просрочено, что скоро и что можно взять в работу"
          breadcrumbs={[
            { label: 'Магазин', href: base },
            { label: 'Сегодня' },
          ]}
          actions={
            <div className="page-header__actions">
              {canClaimNext ? (
                <Button type="button" disabled={busy} onClick={() => void claimNext()}>
                  Взять следующий
                </Button>
              ) : null}
              <Button type="button" variant="secondary" disabled={busy} onClick={() => void load()}>
                Обновить
              </Button>
            </div>
          }
        />

        {loading ? <LoadingState message="Загрузка рабочего пространства…" /> : null}
        {error ? <ErrorState message={error} /> : null}
        {message ? <InlineAlert tone="info">{message}</InlineAlert> : null}

        {!loading && !error && data ? (
          <>
            <Section>
              <div className="metric-grid metric-grid--essential">
                <MetricCard
                  label="Просрочены"
                  value={data.counters.overdue.count}
                  hint="Нужно закрыть в первую очередь"
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
                  hint="Уже в работе у флористов"
                  href={filterHref(data.counters.inPreparation.filterLink)}
                  tint={3}
                />
                <MetricCard
                  label="Готовы"
                  value={data.counters.ready.count}
                  hint="Можно выдавать или доставлять"
                  href={filterHref(data.counters.ready.filterLink)}
                  tone="success"
                  tint={4}
                />
              </div>
            </Section>

            {data.attentionItems.length > 0 ||
            data.lowStockWarnings.length > 0 ||
            data.counters.unassigned.count > 0 ||
            data.counters.partiallyReserved.count > 0 ? (
              <Section>
                <Card title="Требует внимания">
                  <div className="attention-list">
                    {data.counters.unassigned.count > 0 ? (
                      <InlineAlert tone="info" title="Без назначения">
                        {data.counters.unassigned.count} заказ(ов) без флориста.{' '}
                        <Link href={filterHref(data.counters.unassigned.filterLink)}>Открыть список</Link>
                      </InlineAlert>
                    ) : null}
                    {data.counters.partiallyReserved.count > 0 ? (
                      <InlineAlert tone="warning" title="Нехватка состава">
                        {data.counters.partiallyReserved.count} заказ(ов) с дефицитом позиций.{' '}
                        <Link href={filterHref(data.counters.partiallyReserved.filterLink)}>
                          Открыть список
                        </Link>
                      </InlineAlert>
                    ) : null}
                    {data.attentionItems.slice(0, data.sectionLimit).map((item) => (
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
                    {data.lowStockWarnings.slice(0, data.sectionLimit).map((warning) => (
                      <InlineAlert
                        key={`${warning.itemId}-${warning.warehouseId}`}
                        tone="warning"
                        title={`Мало на складе: ${warning.itemName}`}
                      >
                        {warning.itemCode}: доступно {warning.availableQuantity} (порог{' '}
                        {warning.threshold}). <Link href={`${base}/stock`}>Открыть склад</Link>
                      </InlineAlert>
                    ))}
                  </div>
                </Card>
              </Section>
            ) : null}

            {data.quickActions.length > 0 ? (
              <Section>
                <Card title="Быстрые действия">
                  <div className="page-header__actions">
                    {data.quickActions.map((action) => {
                      if (action.code === 'CLAIM_NEXT') {
                        return (
                          <Button
                            key={action.code}
                            type="button"
                            disabled={busy || !canClaimNext}
                            onClick={() => void claimNext()}
                          >
                            {action.label}
                          </Button>
                        );
                      }
                      if (action.code === 'CREATE_ORDER') {
                        return (
                          <Button
                            key={action.code}
                            type="button"
                            variant="secondary"
                            onClick={() => router.push(`${base}/orders`)}
                          >
                            {action.label}
                          </Button>
                        );
                      }
                      if (action.code === 'CREATE_SALE') {
                        return (
                          <Button
                            key={action.code}
                            type="button"
                            variant="secondary"
                            onClick={() => router.push(`${base}/sales/new`)}
                          >
                            {action.label}
                          </Button>
                        );
                      }
                      if (action.code === 'RECEIVE_SUPPLY') {
                        return (
                          <Button
                            key={action.code}
                            type="button"
                            variant="secondary"
                            onClick={() => router.push(`${base}/supplies`)}
                          >
                            {action.label}
                          </Button>
                        );
                      }
                      return null;
                    })}
                  </div>
                </Card>
              </Section>
            ) : null}

            {sectionCards('Скоро', data.sections.soon)}
            {sectionCards('В подготовке', data.sections.inPreparation)}
            {sectionCards('Без назначения', data.sections.unassigned)}
            {sectionCards('Готовы', data.sections.ready)}
            {sectionCards('Просрочены', data.sections.overdue)}
          </>
        ) : null}
      </PageContainer>
    </main>
  );
}
