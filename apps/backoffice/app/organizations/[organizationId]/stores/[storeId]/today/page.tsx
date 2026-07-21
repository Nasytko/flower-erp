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
  CLAIM: 'Claim',
  START_PREPARATION: 'Start prep',
  EDIT_ACTUAL: 'Edit actual',
  MARK_READY: 'Mark ready',
  CREATE_SALE: 'Create sale',
  VIEW: 'Open',
  NONE: 'Open',
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
      setError(err instanceof ApiClientError ? err.message : 'Failed to load workspace');
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
      setError(err instanceof ApiClientError ? err.message : 'Action failed');
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
        setMessage('No order available to claim.');
        return;
      }
      router.push(`${base}/work-orders/${result.order.id}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Claim next failed');
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
            <EmptyState message="Nothing here." />
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
          <ErrorState message="Access denied: workspace:read or orders:read required." />
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
          description="Florist workspace for today’s queue"
          breadcrumbs={[
            { label: 'Store', href: base },
            { label: 'Сегодня' },
          ]}
          actions={
            <div className="page-header__actions">
              {canClaimNext ? (
                <Button type="button" disabled={busy} onClick={() => void claimNext()}>
                  Claim next
                </Button>
              ) : null}
              <Button type="button" variant="secondary" disabled={busy} onClick={() => void load()}>
                Refresh
              </Button>
            </div>
          }
        />

        {loading ? <LoadingState message="Loading workspace…" /> : null}
        {error ? <ErrorState message={error} /> : null}
        {message ? <InlineAlert tone="info">{message}</InlineAlert> : null}

        {!loading && !error && data ? (
          <>
            <Section>
              <div className="metric-grid">
                <MetricCard
                  label="Overdue"
                  value={data.counters.overdue.count}
                  href={filterHref(data.counters.overdue.filterLink)}
                  tone="danger"
                />
                <MetricCard
                  label="Soon"
                  value={data.counters.soon.count}
                  href={filterHref(data.counters.soon.filterLink)}
                  tone="warning"
                />
                <MetricCard
                  label="Unassigned"
                  value={data.counters.unassigned.count}
                  href={filterHref(data.counters.unassigned.filterLink)}
                />
                <MetricCard
                  label="In prep"
                  value={data.counters.inPreparation.count}
                  href={filterHref(data.counters.inPreparation.filterLink)}
                />
                <MetricCard
                  label="Ready"
                  value={data.counters.ready.count}
                  href={filterHref(data.counters.ready.filterLink)}
                  tone="success"
                />
                <MetricCard
                  label="Today"
                  value={data.counters.today.count}
                  href={filterHref(data.counters.today.filterLink)}
                />
                <MetricCard
                  label="Shortage"
                  value={data.counters.partiallyReserved.count}
                  href={filterHref(data.counters.partiallyReserved.filterLink)}
                  tone="warning"
                />
              </div>
            </Section>

            {data.attentionItems.length > 0 || data.lowStockWarnings.length > 0 ? (
              <Section>
                <Card title="Attention">
                  <div className="attention-list">
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
                        title={`Low stock: ${warning.itemName}`}
                      >
                        Operational warning — {warning.itemCode}: available{' '}
                        {warning.availableQuantity} (threshold {warning.threshold}).{' '}
                        <Link href={`${base}/stock`}>View stock</Link>
                      </InlineAlert>
                    ))}
                  </div>
                </Card>
              </Section>
            ) : null}

            {data.quickActions.length > 0 ? (
              <Section>
                <Card title="Quick actions">
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

            {sectionCards('Urgent', data.sections.soon)}
            {sectionCards('In preparation', data.sections.inPreparation)}
            {sectionCards('Unassigned', data.sections.unassigned)}
            {sectionCards('Ready', data.sections.ready)}
            {sectionCards('Overdue', data.sections.overdue)}
          </>
        ) : null}
      </PageContainer>
    </main>
  );
}
