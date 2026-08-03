'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@flower/ui';
import {
  ApiClientError,
  type OrderBoardCardDto,
  type OrderCalendarBoardDto,
} from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { ErrorState, LoadingState } from '@/components/layout/states';
import { InlineAlert } from '@/components/workspace/workspace-ui';
import { OrderCalendarBoard } from '@/components/order/order-calendar-board';
import { OrderCalendarDayStats } from '@/components/order/order-calendar-day-stats';
import { OrderCalendarDatePicker } from '@/components/order/order-calendar-date-picker';
import { OrderCalendarDateStrip } from '@/components/order/order-calendar-date-strip';
import {
  monthIsoFromDate,
  orderCountForDate,
  shiftIsoDate,
  sortOrderBoardCards,
} from '@/lib/order-calendar-labels';
import { executeCalendarMove } from '@/lib/order-calendar-move';
import { todayIsoDate } from '@/lib/delivery-labels';

function matchesSearch(card: OrderBoardCardDto, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    card.number,
    card.customerName,
    card.customerPhone,
    card.recipientName,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

type OrderCalendarViewProps = {
  initialDate?: string;
};

export function OrderCalendarView({ initialDate }: OrderCalendarViewProps) {
  const params = useParams<{ organizationId: string; storeId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const auth = useAuth();
  const { organizationId, storeId } = params;
  const base = `/organizations/${organizationId}/stores/${storeId}`;

  const [date, setDate] = useState(
    initialDate || searchParams.get('date') || todayIsoDate(),
  );
  const [viewMonth, setViewMonth] = useState(monthIsoFromDate(date));
  const [search, setSearch] = useState('');
  const [board, setBoard] = useState<OrderCalendarBoardDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canRead = auth.hasPermission('orders:read');
  const canCreate = auth.hasPermission('orders:create');
  const canCreateSale = auth.hasPermission('sales:create');
  const newOrderHref = `${base}/orders/new`;
  const permissions = useMemo(
    () => ({
      canAssign: auth.hasPermission('orders:assign'),
      canPrepare: auth.hasPermission('orders:prepare'),
      canDelivery: auth.hasPermission('delivery:read') || auth.hasPermission('delivery:manage-couriers'),
    }),
    [auth],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getApiClient().getOrderCalendarBoard(organizationId, storeId, date);
      setBoard(data);
      setViewMonth(data.month);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось загрузить календарь');
    } finally {
      setLoading(false);
    }
  }, [organizationId, storeId, date]);

  useEffect(() => {
    if (!canRead) return;
    void load();
  }, [canRead, load]);

  useEffect(() => {
    const next = searchParams.get('date') || todayIsoDate();
    setDate(next);
    setViewMonth(monthIsoFromDate(next));
  }, [searchParams]);

  function selectDate(next: string) {
    setDate(next);
    setViewMonth(monthIsoFromDate(next));
    router.replace(`${base}/orders/calendar?date=${encodeURIComponent(next)}`);
  }

  function selectMonth(nextMonth: string) {
    setViewMonth(nextMonth);
    if (!nextMonth.startsWith(date.slice(0, 7))) {
      selectDate(`${nextMonth}-01`);
    }
  }

  const filteredSections = useMemo(() => {
    if (!board) return null;
    const next = { ...board.sections };
    for (const key of Object.keys(next) as Array<keyof typeof next>) {
      next[key] = next[key]
        .filter((card) => matchesSearch(card, search))
        .sort(sortOrderBoardCards);
    }
    return next;
  }, [board, search]);

  const todayIso = todayIsoDate();
  const tomorrowIso = shiftIsoDate(todayIso, 1);
  const todayOrderCount = board ? orderCountForDate(board.dateCounts, todayIso) : 0;
  const tomorrowOrderCount = board ? orderCountForDate(board.dateCounts, tomorrowIso) : 0;

  async function handleMove(ctx: Pick<Parameters<typeof executeCalendarMove>[1], 'card' | 'fromColumn' | 'toColumn'>) {
    await executeCalendarMove(getApiClient(), {
      ...ctx,
      organizationId,
      storeId,
    });
    await load();
  }

  function openOrder(card: OrderBoardCardDto) {
    router.push(`${base}/orders/${card.id}`);
  }

  if (!canRead) {
    return (
      <main>
        <PageContainer>
          <ErrorState message="Доступ запрещён: требуется orders:read." />
        </PageContainer>
      </main>
    );
  }

  return (
    <main className="order-calendar-page">
      <PageContainer>
        <PageHeader
          title="Календарь заказов"
          description="Смена на день — перетаскивайте карточки между колонками."
          breadcrumbs={[
            { label: 'Магазин', href: base },
            { label: 'Заказы' },
          ]}
          actions={
            canCreate ? (
              <Link href={newOrderHref} className="order-calendar-page__new-link">
                <Button type="button">Новый заказ</Button>
              </Link>
            ) : null
          }
        />

        <div className="order-calendar-controls">
          <div className="order-calendar-toolbar">
            <label className="order-calendar-toolbar__search">
              <span className="visually-hidden">Поиск заказов</span>
              <input
                type="search"
                className="order-calendar-toolbar__search-input"
                placeholder="Телефон, имя, № заказа…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Поиск заказов"
              />
            </label>
            {board ? (
              <div className="order-calendar-toolbar__date-group">
                <Button
                  type="button"
                  variant="secondary"
                  className="order-calendar-toolbar__date-arrow"
                  onClick={() => selectDate(shiftIsoDate(date, -1))}
                  aria-label="Предыдущий день"
                >
                  ←
                </Button>
                <OrderCalendarDatePicker
                  date={date}
                  viewMonth={viewMonth}
                  dateCounts={board.dateCounts}
                  onSelectDate={selectDate}
                  onChangeMonth={selectMonth}
                />
                <Button
                  type="button"
                  variant="secondary"
                  className="order-calendar-toolbar__date-arrow"
                  onClick={() => selectDate(shiftIsoDate(date, 1))}
                  aria-label="Следующий день"
                >
                  →
                </Button>
              </div>
            ) : null}
            <div className="order-calendar-toolbar__nav">
              <button
                type="button"
                className={`order-calendar-quick-day${date === todayIso ? ' order-calendar-quick-day--active' : ''}`}
                onClick={() => selectDate(todayIso)}
              >
                Сегодня
                {todayOrderCount > 0 ? (
                  <span className="order-calendar-quick-day__badge" aria-label={`${todayOrderCount} заказов`}>
                    {todayOrderCount}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                className={`order-calendar-quick-day${date === tomorrowIso ? ' order-calendar-quick-day--active' : ''}`}
                onClick={() => selectDate(tomorrowIso)}
              >
                Завтра
                {tomorrowOrderCount > 0 ? (
                  <span className="order-calendar-quick-day__badge" aria-label={`${tomorrowOrderCount} заказов`}>
                    {tomorrowOrderCount}
                  </span>
                ) : null}
              </button>
              <Button type="button" variant="secondary" className="order-calendar-toolbar__refresh" onClick={() => void load()}>
                Обновить
              </Button>
            </div>
          </div>

          {board ? (
            <>
              <OrderCalendarDateStrip
                selectedDate={date}
                dateCounts={board.dateCounts}
                onSelect={selectDate}
              />
              <OrderCalendarDayStats sections={filteredSections ?? board.sections} />
            </>
          ) : null}
        </div>

        {loading ? <LoadingState message="Загрузка календаря…" /> : null}
        {error ? <ErrorState message={error} /> : null}

        {!loading && !error && filteredSections ? (
          <Section>
            {!permissions.canAssign && !permissions.canPrepare ? (
              <InlineAlert tone="info">
                Перетаскивание недоступно — нужны права orders:assign или orders:prepare. Тяните карточку за ручку слева.
              </InlineAlert>
            ) : null}
            <OrderCalendarBoard
              base={base}
              sections={filteredSections}
              canCreateSale={canCreateSale}
              permissions={permissions}
              onOpen={openOrder}
              onMove={handleMove}
            />
          </Section>
        ) : null}
      </PageContainer>
    </main>
  );
}
