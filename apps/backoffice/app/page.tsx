'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button, Card } from '@flower/ui';
import {
  ApiClientError,
  type DeliveryBoardCardDto,
  type DeliveryBoardDto,
  type OperationsBoardDto,
  type OperationalStockRowDto,
} from '@flower/api-client';
import { useAuth } from '@/components/auth-provider';
import { HealthPanel } from '@/components/health-panel';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';
import { MetricCard } from '@/components/workspace/workspace-ui';
import { getApiClient } from '@/lib/api-client';
import {
  addDays,
  flattenPendingDeliveries,
  formatMoney,
  formatQty,
  isWithinLocalDay,
  sumStockValue,
  toDateInputValue,
} from '@/lib/dashboard-kpis';
import { resolveNavWorkspace } from '@/lib/nav';
import { usePathname } from 'next/navigation';

type SaleRow = {
  id: string;
  type: string;
  status: string;
  orderId: string | null;
  netAmount: string;
  completedAt: string | null;
  currencyCode: string;
};

type DashboardData = {
  kpis: OperationsBoardDto['kpis'];
  salesToday: number;
  salesDelivery: number;
  salesStore: number;
  salesAmount: number;
  currencyCode: string;
  pendingToday: number;
  pendingTomorrow: number;
  todayDeliveries: DeliveryBoardCardDto[];
  tomorrowDeliveries: DeliveryBoardCardDto[];
  flowerQtyOnHand: number;
  flowerQtyAvailable: number;
  flowerValue: number | null;
  flowerSkus: number;
  topFlowers: Array<OperationalStockRowDto & { lineValue: number | null }>;
  costRedacted: boolean;
};

function formatWindow(start: string, end: string): string {
  try {
    const s = new Date(start);
    const e = new Date(end);
    const opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
    return `${s.toLocaleTimeString('ru-RU', opts)}–${e.toLocaleTimeString('ru-RU', opts)}`;
  } catch {
    return '—';
  }
}

export default function DashboardPage() {
  const auth = useAuth();
  const pathname = usePathname();
  const workspace = useMemo(
    () => resolveNavWorkspace(pathname, auth.organization?.id),
    [pathname, auth.organization?.id],
  );

  const organizationId = workspace.organizationId;
  const storeId = workspace.storeId;
  const base =
    organizationId && storeId ? `/organizations/${organizationId}/stores/${storeId}` : null;

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canOps = auth.hasPermission('operations:read');
  const canSales = auth.hasPermission('sales:read');
  const canDelivery = auth.hasPermission('delivery:read');
  const canStock =
    auth.hasPermission('workspace:read') ||
    auth.hasPermission('orders:read') ||
    auth.hasPermission('inventory:read');
  const canMasterData = auth.hasPermission('master-data:read');

  const load = useCallback(async () => {
    if (!organizationId || !storeId) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    const client = getApiClient();
    const today = new Date();
    const tomorrow = addDays(today, 1);
    const todayKey = toDateInputValue(today);
    const tomorrowKey = toDateInputValue(tomorrow);

    try {
      const opsPromise = canOps
        ? client.getOperations(organizationId, storeId)
        : Promise.resolve(null);
      const salesPromise = canSales
        ? client.listSales(organizationId, storeId, { status: 'COMPLETED' })
        : Promise.resolve([] as SaleRow[]);
      const ordersPromise =
        canSales || canOps
          ? client.listOrders(organizationId, storeId).catch(() => [])
          : Promise.resolve([]);
      const boardTodayPromise = canDelivery
        ? client.getDeliveryBoard(organizationId, storeId, todayKey)
        : Promise.resolve(null);
      const boardTomorrowPromise = canDelivery
        ? client.getDeliveryBoard(organizationId, storeId, tomorrowKey)
        : Promise.resolve(null);
      const stockPromise = canStock
        ? client.getOperationalStock(organizationId, storeId).catch(() => null)
        : Promise.resolve(null);
      const flowersPromise = canMasterData
        ? client
            .listItems(organizationId, {
              itemType: 'FLOWER',
              status: 'ACTIVE',
              pageSize: 200,
            })
            .catch(() => null)
        : Promise.resolve(null);

      const [ops, sales, orders, boardToday, boardTomorrow, stock, flowers] = await Promise.all([
        opsPromise,
        salesPromise,
        ordersPromise,
        boardTodayPromise,
        boardTomorrowPromise,
        stockPromise,
        flowersPromise,
      ]);

      const orderTypeById = new Map(
        (orders as Array<{ id: string; type: string }>).map((o) => [o.id, o.type]),
      );

      const todaySales = (sales as SaleRow[]).filter((s) =>
        isWithinLocalDay(s.completedAt, today),
      );
      let salesDelivery = 0;
      let salesStore = 0;
      let salesAmount = 0;
      let currencyCode = 'RUB';
      for (const sale of todaySales) {
        salesAmount += Number(sale.netAmount) || 0;
        currencyCode = sale.currencyCode || currencyCode;
        if (sale.type === 'DIRECT') {
          salesStore += 1;
          continue;
        }
        const orderType = sale.orderId ? orderTypeById.get(sale.orderId) : undefined;
        if (orderType === 'PICKUP') {
          salesStore += 1;
        } else {
          // ORDER_BASED without known type → считаем доставкой по умолчанию
          salesDelivery += 1;
        }
      }

      const pendingTodayList = boardToday
        ? (flattenPendingDeliveries(boardToday as DeliveryBoardDto) as DeliveryBoardCardDto[])
        : [];
      const pendingTomorrowList = boardTomorrow
        ? (flattenPendingDeliveries(boardTomorrow as DeliveryBoardDto) as DeliveryBoardCardDto[])
        : [];

      const flowerIds = new Set((flowers?.items ?? []).map((i) => i.id));
      const flowerRows =
        stock == null
          ? []
          : flowerIds.size > 0
            ? stock.items.filter((row) => flowerIds.has(row.itemId))
            : stock.items;
      const flowerAgg = sumStockValue(flowerRows);
      const topFlowers = [...flowerRows]
        .sort((a, b) => Number(b.onHandQuantity) - Number(a.onHandQuantity))
        .slice(0, 8)
        .map((row) => ({
          ...row,
          lineValue:
            row.unitCost != null && !Number.isNaN(Number(row.unitCost))
              ? Number(row.onHandQuantity) * Number(row.unitCost)
              : null,
        }));

      setData({
        kpis: ops?.kpis ?? {
          ordersToday: 0,
          inProgress: 0,
          ready: 0,
          overdue: 0,
          salesToday: todaySales.length,
          unpaidBalance: '0',
          shortages: 0,
          suppliesAwaitingReceipt: 0,
        },
        salesToday: ops?.kpis.salesToday ?? todaySales.length,
        salesDelivery,
        salesStore,
        salesAmount,
        currencyCode,
        pendingToday: pendingTodayList.length,
        pendingTomorrow: pendingTomorrowList.length,
        todayDeliveries: pendingTodayList.slice(0, 6),
        tomorrowDeliveries: pendingTomorrowList.slice(0, 6),
        flowerQtyOnHand: flowerAgg.qtyOnHand,
        flowerQtyAvailable: flowerAgg.qtyAvailable,
        flowerValue: stock?.costRedacted || !flowerAgg.hasCost ? null : flowerAgg.value,
        flowerSkus: flowerRows.length,
        topFlowers,
        costRedacted: stock?.costRedacted ?? true,
      });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось загрузить обзор');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [
    organizationId,
    storeId,
    canOps,
    canSales,
    canDelivery,
    canStock,
    canMasterData,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!organizationId || !storeId) {
    return (
      <main>
        <PageContainer>
          <PageHeader
            title="Обзор"
            description="Выберите магазин в шапке, чтобы увидеть KPI."
            breadcrumbs={[{ label: 'Обзор' }]}
          />
          <Section>
            <EmptyState message="Магазин не выбран. Откройте переключатель контекста и выберите магазин." />
          </Section>
        </PageContainer>
      </main>
    );
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Обзор"
          description="Главные показатели магазина на сегодня"
          breadcrumbs={[{ label: 'Обзор' }]}
          actions={
            <Button type="button" variant="secondary" onClick={() => void load()}>
              Обновить
            </Button>
          }
        />

        {loading ? <LoadingState message="Загрузка обзора…" /> : null}
        {error ? <ErrorState message={error} /> : null}

        {!loading && !error && data && base ? (
          <>
            <Section>
              <div className="metric-grid">
                <MetricCard
                  label="Продажи сегодня"
                  value={data.salesToday}
                  href={`${base}/sales`}
                />
                <MetricCard
                  label="Из них доставка"
                  value={data.salesDelivery}
                  href={`${base}/deliveries`}
                />
                <MetricCard
                  label="Из них в магазине"
                  value={data.salesStore}
                  href={`${base}/sales`}
                  tone="success"
                />
                <MetricCard
                  label="Сумма продаж"
                  value={formatMoney(data.salesAmount, data.currencyCode)}
                  href={`${base}/sales`}
                />
                <MetricCard
                  label="Доставки в ожидании · сегодня"
                  value={data.pendingToday}
                  href={`${base}/deliveries`}
                  tone={data.pendingToday > 0 ? 'warning' : 'default'}
                />
                <MetricCard
                  label="Доставки в ожидании · завтра"
                  value={data.pendingTomorrow}
                  href={`${base}/deliveries/calendar`}
                  tone={data.pendingTomorrow > 0 ? 'warning' : 'default'}
                />
                <MetricCard
                  label="Остаток цветка (доступно)"
                  value={formatQty(data.flowerQtyAvailable)}
                  href={`${base}/stock`}
                />
                <MetricCard
                  label="Сумма остатка цветка"
                  value={
                    data.flowerValue != null
                      ? formatMoney(data.flowerValue, data.currencyCode)
                      : data.costRedacted
                        ? 'Скрыто'
                        : '—'
                  }
                  href={`${base}/stock`}
                  tone="warning"
                />
              </div>
            </Section>

            <Section>
              <div className="metric-grid">
                <MetricCard label="Заказы сегодня" value={data.kpis.ordersToday} href={`${base}/today`} />
                <MetricCard label="В работе" value={data.kpis.inProgress} />
                <MetricCard label="Готовы" value={data.kpis.ready} tone="success" />
                <MetricCard
                  label="Просрочены"
                  value={data.kpis.overdue}
                  tone="danger"
                  href={`${base}/today`}
                />
                <MetricCard
                  label="Неоплаченный остаток"
                  value={data.kpis.unpaidBalance}
                  href={`${base}/payments`}
                  tone="warning"
                />
                <MetricCard
                  label="Нехватка"
                  value={data.kpis.shortages}
                  href={`${base}/stock`}
                  tone="warning"
                />
              </div>
            </Section>

            <Section>
              <div className="dashboard-split">
                <Card title="Доставки сегодня (ожидают)">
                  {data.todayDeliveries.length === 0 ? (
                    <EmptyState message="Нет ожидающих доставок на сегодня." />
                  ) : (
                    <ul className="dashboard-mini-list">
                      {data.todayDeliveries.map((row) => (
                        <li key={row.id}>
                          <Link href={`${base}/deliveries/${row.id}`} className="dashboard-mini-list__link">
                            <span className="dashboard-mini-list__title">
                              {row.orderNumber ?? row.id.slice(0, 8)}
                            </span>
                            <span className="dashboard-mini-list__meta">
                              {formatWindow(row.windowStart, row.windowEnd)}
                              {' · '}
                              {row.displayAddress || 'Адрес не указан'}
                            </span>
                          </Link>
                          <StatusBadge status={row.status} />
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="dashboard-mini-list__footer">
                    <Link href={`${base}/deliveries`}>Все доставки сегодня →</Link>
                  </p>
                </Card>

                <Card title="Доставки завтра (ожидают)">
                  {data.tomorrowDeliveries.length === 0 ? (
                    <EmptyState message="Нет ожидающих доставок на завтра." />
                  ) : (
                    <ul className="dashboard-mini-list">
                      {data.tomorrowDeliveries.map((row) => (
                        <li key={row.id}>
                          <Link href={`${base}/deliveries/${row.id}`} className="dashboard-mini-list__link">
                            <span className="dashboard-mini-list__title">
                              {row.orderNumber ?? row.id.slice(0, 8)}
                            </span>
                            <span className="dashboard-mini-list__meta">
                              {formatWindow(row.windowStart, row.windowEnd)}
                              {' · '}
                              {row.displayAddress || 'Адрес не указан'}
                            </span>
                          </Link>
                          <StatusBadge status={row.status} />
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="dashboard-mini-list__footer">
                    <Link href={`${base}/deliveries/calendar`}>Календарь доставок →</Link>
                  </p>
                </Card>
              </div>
            </Section>

            <Section>
              <Card title={`Остаток цветка · ${data.flowerSkus} позиций`}>
                <div className="meta-row" style={{ marginBottom: 12 }}>
                  <span>На складе: {formatQty(data.flowerQtyOnHand)}</span>
                  <span>Доступно: {formatQty(data.flowerQtyAvailable)}</span>
                  <span>
                    Сумма:{' '}
                    {data.flowerValue != null
                      ? formatMoney(data.flowerValue, data.currencyCode)
                      : data.costRedacted
                        ? 'скрыта (нет inventory:view-cost)'
                        : '—'}
                  </span>
                </div>
                {data.topFlowers.length === 0 ? (
                  <EmptyState message="Нет остатков цветка или нет доступа к складу." />
                ) : (
                  <ul className="dashboard-mini-list">
                    {data.topFlowers.map((row) => (
                      <li key={row.itemId}>
                        <div className="dashboard-mini-list__link">
                          <span className="dashboard-mini-list__title">
                            {row.itemName}{' '}
                            <span style={{ color: 'var(--color-muted)', fontWeight: 500 }}>
                              ({row.itemCode})
                            </span>
                          </span>
                          <span className="dashboard-mini-list__meta">
                            на складе {formatQty(Number(row.onHandQuantity))} · доступно{' '}
                            {formatQty(Number(row.availableQuantity))}
                            {row.lineValue != null
                              ? ` · ${formatMoney(row.lineValue, data.currencyCode)}`
                              : ''}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="dashboard-mini-list__footer">
                  <Link href={`${base}/stock`}>Все остатки →</Link>
                </p>
              </Card>
            </Section>

            <Section>
              <HealthPanel />
            </Section>
          </>
        ) : null}
      </PageContainer>
    </main>
  );
}
