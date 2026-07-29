'use client';

import Link from 'next/link';
import { Card } from '@flower/ui';
import type { DirectorKpiDto } from '@flower/api-client';
import { DocRef } from '@/components/layout/doc-ref';
import { EmptyState } from '@/components/layout/states';
import { MetricCard } from '@/components/workspace/workspace-ui';
import { formatMoney, formatQuantity } from '@/lib/format-money';

type DirectorKpiPanelProps = {
  base: string;
  directorKpi: DirectorKpiDto;
  variant?: 'full' | 'compact';
};

function payableDueLabel(daysUntilDue: number, isOverdue: boolean): string {
  if (isOverdue) {
    const days = Math.abs(daysUntilDue);
    return days === 0 ? 'просрочено' : `просрочено ${days} дн.`;
  }
  if (daysUntilDue === 0) return 'сегодня';
  if (daysUntilDue === 1) return 'завтра';
  return `через ${daysUntilDue} дн.`;
}

function FinancePeriodBlock({
  title,
  period,
  marginRedacted,
}: {
  title: string;
  period: DirectorKpiDto['finance']['today'];
  marginRedacted: boolean;
}) {
  return (
    <div className="director-finance-block">
      <h3 className="director-finance-block__title">{title}</h3>
      <div className="metric-grid metric-grid--essential">
        <MetricCard
          label="Выручка"
          value={formatMoney(period.revenue)}
          hint={`${period.completedSalesCount} продаж`}
          tint={1}
        />
        <MetricCard
          label="Себестоимость"
          value={marginRedacted ? '—' : formatMoney(period.cogs)}
          hint={marginRedacted ? 'Нет доступа к марже' : undefined}
          tint={2}
        />
        <MetricCard
          label="Валовая прибыль"
          value={marginRedacted ? '—' : formatMoney(period.grossProfit)}
          tone={marginRedacted ? 'default' : 'success'}
          tint={3}
        />
        <MetricCard
          label="Маржа"
          value={marginRedacted || !period.avgMarginPercent ? '—' : `${period.avgMarginPercent}%`}
          tone={marginRedacted ? 'default' : 'success'}
          tint={4}
        />
      </div>
    </div>
  );
}

export function DirectorKpiPanel({ base, directorKpi, variant = 'full' }: DirectorKpiPanelProps) {
  const { orders, finance, payables, orderedFlowers } = directorKpi;

  if (variant === 'compact') {
    return (
      <SectionFinanceCompact base={base} finance={finance} />
    );
  }

  return (
    <>
      <section className="director-kpi-section">
        <h2 className="home-section-title">Заказы</h2>
        <div className="metric-grid metric-grid--essential">
          <MetricCard
            label="Без назначения"
            value={orders.newUnassigned}
            href={`${base}/orders?phase=NEW`}
            tint={1}
          />
          <MetricCard
            label="В сборке"
            value={orders.inPreparation}
            href={`${base}/orders?phase=IN_WORK`}
            tint={2}
          />
          <MetricCard
            label="Готовы"
            value={orders.ready}
            href={`${base}/orders?phase=READY`}
            tone="success"
            tint={3}
          />
          <MetricCard
            label="Просрочены"
            value={orders.overdue}
            href={`${base}/home?tab=queue`}
            tone="danger"
            tint={4}
          />
        </div>
      </section>

      <section className="director-kpi-section">
        <h2 className="home-section-title">Юнит-экономика</h2>
        <Card title="Продажи магазина">
          <FinancePeriodBlock title="Сегодня" period={finance.today} marginRedacted={finance.marginRedacted} />
          <FinancePeriodBlock title="7 дней" period={finance.week} marginRedacted={finance.marginRedacted} />
        </Card>
      </section>

      <section className="director-kpi-section">
        <Card title="Ближайшие оплаты поставщикам">
          <p className="director-card-hint">
            На 14 дней · итого {formatMoney(payables.upcomingTotalAmount)}
            {payables.overdueCount > 0 ? ` · просрочено: ${payables.overdueCount}` : ''}
          </p>
          {payables.upcoming.length === 0 ? (
            <EmptyState message="Нет предстоящих оплат в ближайшие 14 дней." />
          ) : (
            <ul className="list-stack">
              {payables.upcoming.map((row) => (
                <li key={row.supplyId}>
                  <Link href={`${base}/supplies/${row.supplyId}`}>
                    <div className="list-row__primary">
                      <DocRef>{row.supplyNumber}</DocRef>
                      <strong>{row.supplierName}</strong>
                      <span>{formatMoney(row.amount)}</span>
                    </div>
                    <p className="list-row__meta">
                      <span className={row.isOverdue ? 'text-danger' : undefined}>
                        {payableDueLabel(row.daysUntilDue, row.isOverdue)} · {row.paymentDueDate}
                      </span>
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <section className="director-kpi-section">
        <Card title="Заказанные цветы">
          <p className="director-card-hint">Поставки у поставщика или частично приняты</p>
          {orderedFlowers.length === 0 ? (
            <EmptyState message="Нет активных заказов цветов у поставщиков." />
          ) : (
            <ul className="list-stack">
              {orderedFlowers.map((row) => (
                <li key={row.itemId}>
                  <div className="director-flower-row">
                    <div className="list-row__primary">
                      <strong>{row.itemName}</strong>
                      <DocRef>{row.itemCode}</DocRef>
                    </div>
                    <span className="director-flower-row__qty">
                      {formatQuantity(row.orderedQuantity)} шт.
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </>
  );
}

function SectionFinanceCompact({
  base,
  finance,
}: {
  base: string;
  finance: DirectorKpiDto['finance'];
}) {
  return (
    <section className="director-kpi-section">
      <div className="home-section-title-row">
        <h2 className="home-section-title">Юнит-экономика</h2>
        <Link href={`${base}/operations`} className="text-link">
          Подробнее
        </Link>
      </div>
      <div className="metric-grid metric-grid--essential">
        <MetricCard
          label="Выручка сегодня"
          value={formatMoney(finance.today.revenue)}
          hint={`${finance.today.completedSalesCount} продаж`}
          href={`${base}/sales`}
          tint={1}
        />
        <MetricCard
          label="Выручка 7 дней"
          value={formatMoney(finance.week.revenue)}
          hint={`${finance.week.completedSalesCount} продаж`}
          href={`${base}/operations`}
          tint={2}
        />
        <MetricCard
          label="Прибыль сегодня"
          value={finance.marginRedacted ? '—' : formatMoney(finance.today.grossProfit)}
          hint={finance.marginRedacted ? 'Нет доступа к марже' : undefined}
          tone={finance.marginRedacted ? 'default' : 'success'}
          tint={3}
        />
        <MetricCard
          label="Маржа 7 дней"
          value={
            finance.marginRedacted || !finance.week.avgMarginPercent
              ? '—'
              : `${finance.week.avgMarginPercent}%`
          }
          tone={finance.marginRedacted ? 'default' : 'success'}
          tint={4}
        />
      </div>
    </section>
  );
}
