'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card } from '@flower/ui';
import {
  ApiClientError,
  type InventoryCountProgressDto,
  type InventoryLossDto,
  type InventoryOpsAttentionDto,
  type InventoryTransitDto,
  type OperationsBoardDto,
} from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/states';
import { AttentionItem, MetricCard } from '@/components/workspace/workspace-ui';

export default function OperationsPage() {
  const params = useParams<{ organizationId: string; storeId: string }>();
  const auth = useAuth();
  const { organizationId, storeId } = params;
  const base = `/organizations/${organizationId}/stores/${storeId}`;

  const [data, setData] = useState<OperationsBoardDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deliveryAttention, setDeliveryAttention] = useState<{
    problems: number;
    withoutCourier: number;
  } | null>(null);
  const [inventoryAttention, setInventoryAttention] = useState<InventoryOpsAttentionDto[]>([]);
  const [inventoryTransit, setInventoryTransit] = useState<InventoryTransitDto[]>([]);
  const [inventoryLosses, setInventoryLosses] = useState<InventoryLossDto[]>([]);
  const [inventoryCountProgress, setInventoryCountProgress] = useState<InventoryCountProgressDto[]>([]);

  const canRead = auth.hasPermission('operations:read');
  const canReadDelivery = auth.hasPermission('delivery:read');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = getApiClient();
      const board = await client.getOperations(organizationId, storeId);
      setData(board);
      try {
        const [attention, transit, losses, progress] = await Promise.all([
          client.getInventoryAttention(organizationId, storeId),
          client.getInventoryInTransit(organizationId, storeId),
          client.getInventoryLosses(organizationId, storeId),
          client.getInventoryCountProgress(organizationId, storeId),
        ]);
        setInventoryAttention(attention);
        setInventoryTransit(transit);
        setInventoryLosses(losses);
        setInventoryCountProgress(progress);
      } catch {
        setInventoryAttention([]);
        setInventoryTransit([]);
        setInventoryLosses([]);
        setInventoryCountProgress([]);
      }
      if (canReadDelivery) {
        try {
          const deliveryBoard = await client.getDeliveryBoard(organizationId, storeId);
          setDeliveryAttention({
            problems: deliveryBoard.sections.problems.length,
            withoutCourier: deliveryBoard.sections.withoutCourier.length,
          });
        } catch {
          setDeliveryAttention(null);
        }
      } else {
        setDeliveryAttention(null);
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load operations');
    } finally {
      setLoading(false);
    }
  }, [organizationId, storeId, canReadDelivery]);

  useEffect(() => {
    if (!canRead) return;
    void load();
  }, [canRead, load]);

  function attentionHref(item: OperationsBoardDto['attentionItems'][number]): string | null {
    if (item.entityType === 'ORDER') return `${base}/work-orders/${item.entityId}`;
    if (item.entityType === 'SALE') return `${base}/sales/${item.entityId}`;
    if (item.filterLink === 'partially_reserved' || item.code.includes('STOCK')) {
      return `${base}/stock`;
    }
    if (item.filterLink) return `${base}/orders?filter=${encodeURIComponent(item.filterLink)}`;
    return null;
  }

  if (!canRead) {
    return (
      <main>
        <PageContainer>
          <ErrorState message="Access denied: operations:read required." />
        </PageContainer>
      </main>
    );
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Operations"
          description="Director operations board"
          breadcrumbs={[
            { label: 'Store', href: base },
            { label: 'Operations' },
          ]}
          actions={
            <Button type="button" variant="secondary" onClick={() => void load()}>
              Refresh
            </Button>
          }
        />

        {loading ? <LoadingState message="Loading operations…" /> : null}
        {error ? <ErrorState message={error} /> : null}

        {!loading && !error && data ? (
          <>
            <Section>
              <div className="metric-grid">
                <MetricCard label="Orders today" value={data.kpis.ordersToday} href={`${base}/today`} />
                <MetricCard label="In progress" value={data.kpis.inProgress} />
                <MetricCard label="Ready" value={data.kpis.ready} tone="success" />
                <MetricCard label="Overdue" value={data.kpis.overdue} tone="danger" href={`${base}/today`} />
                <MetricCard label="Sales today" value={data.kpis.salesToday} href={`${base}/sales`} />
                <MetricCard
                  label="Unpaid balance"
                  value={data.kpis.unpaidBalance}
                  href={`${base}/payments`}
                  tone="warning"
                />
                <MetricCard
                  label="Shortages"
                  value={data.kpis.shortages}
                  href={`${base}/stock`}
                  tone="warning"
                />
                <MetricCard
                  label="Supplies awaiting"
                  value={data.kpis.suppliesAwaitingReceipt}
                  href={`${base}/supplies`}
                />
              </div>
            </Section>

            <Section>
              <Card title="Attention">
                {data.attentionItems.length === 0 ? (
                  <EmptyState message="No attention items." />
                ) : (
                  <div className="attention-list">
                    {data.attentionItems.map((item) => (
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
                )}
              </Card>
            </Section>

            {deliveryAttention &&
            (deliveryAttention.problems > 0 || deliveryAttention.withoutCourier > 0) ? (
              <Section>
                <Card title="Delivery attention">
                  <div className="metric-grid">
                    <MetricCard
                      label="Problems"
                      value={deliveryAttention.problems}
                      href={`${base}/deliveries`}
                      tone="danger"
                    />
                    <MetricCard
                      label="Without courier"
                      value={deliveryAttention.withoutCourier}
                      href={`${base}/deliveries`}
                      tone="warning"
                    />
                  </div>
                </Card>
              </Section>
            ) : null}

            <Section>
              <Card title="Складские операции">
                <div className="metric-grid">
                  <MetricCard
                    label="Attention buckets"
                    value={inventoryAttention.reduce((sum, item) => sum + item.count, 0)}
                    href={`${base}/write-offs`}
                    tone="warning"
                  />
                  <MetricCard
                    label="In transit"
                    value={inventoryTransit.length}
                    href={`${base}/transfers`}
                  />
                  <MetricCard
                    label="Loss documents"
                    value={inventoryLosses.length}
                    href={`${base}/write-offs`}
                    tone="danger"
                  />
                  <MetricCard
                    label="Open counts"
                    value={inventoryCountProgress.filter((item) => item.status !== 'POSTED' && item.status !== 'CANCELLED').length}
                    href={`${base}/inventory-counts`}
                  />
                </div>
              </Card>
            </Section>
          </>
        ) : null}
      </PageContainer>
    </main>
  );
}
