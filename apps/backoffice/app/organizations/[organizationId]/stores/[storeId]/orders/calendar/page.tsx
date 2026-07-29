'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
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
import { OrderCalendarDateStrip } from '@/components/order/order-calendar-date-strip';
import { OrderCalendarDetailPanel } from '@/components/order/order-calendar-detail-panel';
import { OrderCalendarMonthGrid } from '@/components/order/order-calendar-month-grid';
import {
  monthIsoFromDate,
  shiftIsoDate,
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
  const [showMonth, setShowMonth] = useState(true);

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
      next[key] = next[key].filter((card) => matchesSearch(card, search));
    }
    return next;
  }, [board, search]);

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
          <Input
            type="search"
            placeholder="Телефон, имя, № заказа…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Поиск заказов"
          />
          <label className="order-calendar-toolbar__date">
            <span className="visually-hidden">Дата</span>
            <Input type="date" value={date} onChange={(e) => selectDate(e.target.value)} />
          </label>
          <div className="order-calendar-toolbar__nav">
            <Button type="button" variant="secondary" onClick={() => selectDate(shiftIsoDate(date, -1))}>
              ←
            </Button>
            <Button type="button" variant="secondary" onClick={() => selectDate(todayIsoDate())}>
              Сегодня
            </Button>
            <Button type="button" variant="secondary" onClick={() => selectDate(shiftIsoDate(date, 1))}>
              →
            </Button>
            <Button type="button" variant="secondary" onClick={() => setShowMonth((v) => !v)}>
              {showMonth ? 'Скрыть месяц' : 'Месяц'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => void load()}>
              Обновить
            </Button>
          </div>
        </div>
      </Section>

      {board && showMonth ? (
        <Section>
          <OrderCalendarMonthGrid
            month={viewMonth}
            selectedDate={date}
            dateCounts={board.dateCounts}
            onSelectDate={selectDate}
            onChangeMonth={selectMonth}
          />
        </Section>
      ) : null}

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
              Перетаскивание недоступно — нужны права orders:assign или orders:prepare.
            </InlineAlert>
          ) : null}
          <div className="order-calendar-layout">
            <OrderCalendarBoard
              sections={filteredSections}
              selectedId={selected?.id ?? null}
              permissions={permissions}
              onSelect={setSelected}
              onMove={handleMove}
            />
            <OrderCalendarDetailPanel base={base} card={selected} onClose={() => setSelected(null)} />
          </div>
        </Section>
      ) : null}
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
          description="Смена на день — перетаскивайте карточки между колонками."
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
        <Section>
          <Card title="Другие виды">
            <p className="order-calendar-footer-links">
              <Link href={`${base}/orders`}>Список всех заказов</Link>
              {' · '}
              <Link href={`${base}/home`}>Обзор и KPI</Link>
              {auth.hasPermission('delivery:read') ? (
                <>
                  {' · '}
                  <Link href={`${base}/deliveries?date=${encodeURIComponent(date)}`}>Доставки</Link>
                </>
              ) : null}
            </p>
          </Card>
        </Section>
      </PageContainer>
    </main>
  );
}

export default function OrderCalendarPage() {
  return <OrderCalendarView />;
}
