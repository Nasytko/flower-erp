'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { ApiClientError, type OperationalStockDto } from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/states';
import { InlineAlert, SegmentedControl } from '@/components/workspace/workspace-ui';

type StockFilter = 'all' | 'available' | 'reserved' | 'low';

export default function OperationalStockPage() {
  const params = useParams<{ organizationId: string; storeId: string }>();
  const auth = useAuth();
  const { organizationId, storeId } = params;
  const base = `/organizations/${organizationId}/stores/${storeId}`;

  const [data, setData] = useState<OperationalStockDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StockFilter>('all');

  const canRead =
    auth.hasPermission('inventory:read') ||
    auth.hasPermission('workspace:read') ||
    auth.hasPermission('orders:read');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const stock = await getApiClient().getOperationalStock(organizationId, storeId);
      setData(stock);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось загрузить остатки');
    } finally {
      setLoading(false);
    }
  }, [organizationId, storeId]);

  useEffect(() => {
    if (!canRead) return;
    void load();
  }, [canRead, load]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.items.filter((row) => {
      if (q) {
        const hay = `${row.itemName} ${row.itemCode}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const available = Number(row.availableQuantity);
      const reserved = Number(row.reservedQuantity);
      if (filter === 'available') return available > 0;
      if (filter === 'reserved') return reserved > 0;
      if (filter === 'low') return available <= 5;
      return true;
    });
  }, [data, filter, query]);

  if (!canRead) {
    return (
      <main>
        <PageContainer>
          <ErrorState message="Доступ запрещён: требуется inventory:read." />
        </PageContainer>
      </main>
    );
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Остатки"
          description="Операционные остатки на складе"
          breadcrumbs={[
            { label: 'Магазин', href: base },
            { label: 'Остатки' },
          ]}
          actions={
            <div className="page-header__actions">
              {auth.hasPermission('write-offs:read') ? (
                <Button type="button" variant="secondary" onClick={() => (window.location.href = `${base}/write-offs`)}>
                  Списать
                </Button>
              ) : null}
              {auth.hasPermission('transfers:read') ? (
                <Button type="button" variant="secondary" onClick={() => (window.location.href = `${base}/transfers`)}>
                  Переместить
                </Button>
              ) : null}
              <Button type="button" variant="secondary" onClick={() => void load()}>
                Обновить
              </Button>
            </div>
          }
        />

        {loading ? <LoadingState message="Загрузка остатков…" /> : null}
        {error ? <ErrorState message={error} /> : null}

        {!loading && !error && data ? (
          <>
            {data.costRedacted ? (
              <InlineAlert tone="info" title="Себестоимость скрыта">
                Себестоимость скрыта без разрешения inventory:view-cost.
              </InlineAlert>
            ) : null}

            <Section>
              <Card title="Фильтры">
                <div className="stock-filters">
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Поиск по названию или коду"
                    aria-label="Поиск по остаткам"
                  />
                  <SegmentedControl
                    ariaLabel="Фильтр остатков"
                    value={filter}
                    onChange={(value) => setFilter(value as StockFilter)}
                    options={[
                      { value: 'all', label: 'Все' },
                      { value: 'available', label: 'Доступно' },
                      { value: 'reserved', label: 'Зарезервировано' },
                      { value: 'low', label: 'Мало' },
                    ]}
                  />
                </div>
              </Card>
            </Section>

            <Section>
              <Card title={`Позиции (${filtered.length})`}>
                {filtered.length === 0 ? (
                  <EmptyState message="Нет строк остатков по фильтру." />
                ) : (
                  <ul className="stock-list">
                    {filtered.map((row) => (
                      <li key={row.itemId} className="stock-row">
                        <div>
                          <strong>
                            {row.itemName} ({row.itemCode})
                          </strong>
                          <div className="meta-row">
                            <span>На складе {row.onHandQuantity}</span>
                            <span>Зарезервировано {row.reservedQuantity}</span>
                            <span>Доступно {row.availableQuantity}</span>
                            {!data.costRedacted && row.unitCost != null ? (
                              <span>Себестоимость {row.unitCost}</span>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </Section>
          </>
        ) : null}
      </PageContainer>
    </main>
  );
}
