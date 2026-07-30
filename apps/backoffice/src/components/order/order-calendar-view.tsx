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
import { Dialog } from '@/components/ui/dialog';
import { OrderCalendarBoard } from '@/components/order/order-calendar-board';
import { OrderCalendarDatePicker } from '@/components/order/order-calendar-date-picker';
import { OrderCalendarDateStrip } from '@/components/order/order-calendar-date-strip';
import { OrderCalendarDetailContent } from '@/components/order/order-calendar-detail-panel';
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
  embedded?: boolean;
  initialDate?: string;
};

export function OrderCalendarView({ embedded = false, initialDate }: OrderCalendarViewProps) {
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
  const [selected, setSelected] = useState<OrderBoardCardDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canRead = auth.hasPermission('orders:read');
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
      setSelected((prev) => {
        if (!prev) return null;
        for (const cards of Object.values(data.sections)) {
          const match = cards.find((card) => card.id === prev.id);
          if (match) return match;
        }
        return null;
      });
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
    if (embedded) return;
    const next = searchParams.get('date') || todayIsoDate();
    setDate(next);
    setViewMonth(monthIsoFromDate(next));
  }, [embedded, searchParams]);

  function selectDate(next: string) {
    setDate(next);
    setViewMonth(monthIsoFromDate(next));
    if (!embedded) {
      router.replace(`${base}/orders/calendar?date=${encodeURIComponent(next)}`);
    }
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

  if (!canRead) {
    return (
      <main>
        <PageContainer>
          <ErrorState message="Доступ запрещён: требуется orders:read." />
        </PageContainer>
      </main>
    );
  }

  const content = (
    <>
      <Section>
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
            <Button type="button" variant="secondary" onClick={() => void load()}>
              Обновить
            </Button>
          </div>
        </div>
      </Section>

      {board ? (
        <Section>
          <OrderCalendarDateStrip
            selectedDate={date}
            dateCounts={board.dateCounts}
            onSelect={selectDate}
          />
        </Section>
      ) : null}

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
            sections={filteredSections}
            selectedId={selected?.id ?? null}
            permissions={permissions}
            onSelect={setSelected}
            onMove={handleMove}
          />
        </Section>
      ) : null}

      <Dialog
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected ? `Заказ ${selected.number}` : 'Детали заказа'}
        className="order-calendar-order-dialog"
        footer={
          selected ? (
            <>
              <Button type="button" variant="secondary" onClick={() => setSelected(null)}>
                Закрыть
              </Button>
              <Link href={`${base}/orders/${selected.id}`} className="order-calendar-order-dialog__open">
                <Button type="button">Открыть заказ</Button>
              </Link>
            </>
          ) : null
        }
      >
        {selected ? <OrderCalendarDetailContent base={base} card={selected} /> : null}
      </Dialog>
    </>
  );

  if (embedded) {
    return <div className="order-calendar-embedded">{content}</div>;
  }

  return (
    <main className="order-calendar-page">
      <PageContainer>
        <PageHeader
          title="Календарь заказов"
          description="Смена на день — перетаскивайте карточки за ручку слева между колонками."
          breadcrumbs={[
            { label: 'Магазин', href: base },
            { label: 'Заказы', href: `${base}/orders` },
            { label: 'Календарь' },
          ]}
          actions={
            <div className="page-header__actions">
              <Link href={`${base}/home`}>
                <Button type="button" variant="secondary">
                  Обзор директора
                </Button>
              </Link>
              <Link href={`${base}/orders`}>
                <Button type="button" variant="secondary">
                  Все заказы
                </Button>
              </Link>
            </div>
          }
        />
        {content}
      </PageContainer>
    </main>
  );
}
