'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { getApiClient } from '@/lib/api-client';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';
import { Field } from '@/components/layout/field';
import { FancySelect } from '@/components/layout/fancy-select';
import { formatApiErrorMessage } from '@/lib/format-api-error';
import {
  type FieldErrors,
  firstFieldError,
  hasFieldErrors,
  requiredText,
} from '@/lib/form-validation';

type Item = {
  id: string;
  name: string;
  code: string;
  itemType: string;
  status: string;
  isSellable?: boolean;
  minimumStockQuantity?: string | null;
  createdAt?: string;
  createdByDisplayName?: string | null;
};

function itemTypeLabel(type: string) {
  return type === 'MATERIAL' ? 'Материал' : 'Цветок';
}

function formatWhen(value?: string) {
  if (!value) return null;
  try {
    return new Date(value).toLocaleString('ru-RU');
  } catch {
    return value;
  }
}

export default function ItemsPage() {
  const params = useParams<{ organizationId: string }>();
  const organizationId = params.organizationId;
  const base = `/organizations/${organizationId}/master-data`;

  const [items, setItems] = useState<Item[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [nameFilter, setNameFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('ACTIVE');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [itemType, setItemType] = useState<'FLOWER' | 'MATERIAL'>('FLOWER');
  const [description, setDescription] = useState('');
  const [isSellable, setIsSellable] = useState(false);
  const [minimumStock, setMinimumStock] = useState('');
  const [creating, setCreating] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = getApiClient();
      const list = await client.listItems(organizationId, {
          page,
          pageSize: 10,
          name: nameFilter || undefined,
          itemType: typeFilter || undefined,
          status: statusFilter || undefined,
          sortBy: 'name',
          sortDir: 'asc',
        });
      setItems(list.items);
      setTotalPages(list.totalPages);
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось загрузить товары'));
    } finally {
      setLoading(false);
    }
  }, [organizationId, page, nameFilter, typeFilter, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    const errors: FieldErrors = {
      name: requiredText(name, 'Укажите название'),
    };
    setFieldErrors(errors);
    if (hasFieldErrors(errors)) {
      setError(firstFieldError(errors));
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await getApiClient().createItem(organizationId, {
        name,
        itemType,
        description: description.trim() || undefined,
        isSellable,
        isPurchasable: true,
        minimumStockQuantity:
          itemType === 'FLOWER' && minimumStock.trim() ? minimumStock.trim() : undefined,
      });
      setName('');
      setDescription('');
      setIsSellable(false);
      setMinimumStock('');
      await load();
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось создать товар'));
    } finally {
      setCreating(false);
    }
  }

  async function onArchive(itemId: string) {
    setError(null);
    try {
      await getApiClient().archiveItem(organizationId, itemId);
      await load();
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось архивировать'));
    }
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Товары"
          description="Цветы и материалы для сборки, либо готовые букеты с признаком «продаётся»."
          breadcrumbs={[
            { label: 'Организации', href: '/organizations' },
            { label: 'Организация', href: `/organizations/${organizationId}` },
            { label: 'Справочники', href: base },
            { label: 'Товары' },
          ]}
        />

        <Section>
          <Card title="Фильтры">
            <form
              className="form-grid"
              style={{ maxWidth: '100%', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}
              onSubmit={(e) => {
                e.preventDefault();
                setPage(1);
                void load();
              }}
            >
              <Field label="Название">
                <Input
                  value={nameFilter}
                  onChange={(e) => setNameFilter(e.target.value)}
                  aria-label="Фильтр по названию"
                />
              </Field>
              <Field label="Тип">
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  aria-label="Фильтр по типу"
                  style={{
                    minHeight: 40,
                    borderRadius: 6,
                    border: '1px solid var(--color-border)',
                    padding: 8,
                    width: '100%',
                  }}
                >
                  <option value="">Все типы</option>
                  <option value="FLOWER">Цветок</option>
                  <option value="MATERIAL">Материал</option>
                </select>
              </Field>
              <Field label="Статус">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  aria-label="Фильтр по статусу"
                  style={{
                    minHeight: 40,
                    borderRadius: 6,
                    border: '1px solid var(--color-border)',
                    padding: 8,
                    width: '100%',
                  }}
                >
                  <option value="">Все статусы</option>
                  <option value="ACTIVE">Активные</option>
                  <option value="ARCHIVED">В архиве</option>
                </select>
              </Field>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <Button type="submit" variant="secondary">
                  Применить
                </Button>
              </div>
            </form>
          </Card>
        </Section>

        <Section>
          <Card title="Список">
            {loading ? <LoadingState /> : null}
            {error ? <ErrorState message={error} /> : null}
            {!loading && !error && items.length === 0 ? (
              <EmptyState message="Товаров пока нет. Создайте первый товар ниже." />
            ) : null}
            <ul className="list-stack">
              {items.map((item) => (
                <li key={item.id}>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 12,
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: 12,
                      border: '1px solid var(--color-border)',
                      borderRadius: 10,
                      background: 'var(--color-surface)',
                    }}
                  >
                    <div>
                      <Link href={`${base}/items/${item.id}`}>
                        <strong>
                          {item.name} ({item.code})
                        </strong>
                      </Link>
                      <div className="meta-row" style={{ marginTop: 4 }}>
                        <StatusBadge status={itemTypeLabel(item.itemType)} />
                        <StatusBadge status={item.status} />
                        {item.isSellable ? (
                          <span className="sale-type-pill">Готовый букет</span>
                        ) : null}
                      </div>
                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 'var(--text-xs)',
                          color: 'var(--color-muted)',
                        }}
                      >
                        Добавил: {item.createdByDisplayName ?? 'неизвестно'}
                        {formatWhen(item.createdAt) ? ` · ${formatWhen(item.createdAt)}` : null}
                        {item.itemType === 'FLOWER' && item.minimumStockQuantity
                          ? ` · порог ${item.minimumStockQuantity}`
                          : null}
                      </div>
                    </div>
                    {item.status !== 'ARCHIVED' ? (
                      <Button variant="ghost" onClick={() => void onArchive(item.id)}>
                        Архив
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
            <div className="meta-row" style={{ marginTop: 12 }}>
              <Button
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Назад
              </Button>
              <span>
                Стр. {page} / {totalPages}
              </span>
              <Button
                variant="secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Вперёд
              </Button>
            </div>
          </Card>
        </Section>

        <Section>
          <Card title="Создать товар">
            <form onSubmit={onCreate} className="form-grid" noValidate>
              <Field
                label="Название"
                required
                error={fieldErrors.name}
                hint="Как товар будет отображаться в поставках и на складе"
              >
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={2}
                  aria-label="Название товара"
                />
              </Field>
              <Field
                label="Тип"
                required
                hint="Цветок — партии и срок годности; материал — без партий (политика подставится сама)"
              >
                <FancySelect
                  value={itemType}
                  onChange={(value) => setItemType(value as 'FLOWER' | 'MATERIAL')}
                  options={[
                    { value: 'FLOWER', label: 'Цветок' },
                    { value: 'MATERIAL', label: 'Материал' },
                  ]}
                  searchable={false}
                  aria-label="Тип товара"
                />
              </Field>
              <Field label="Описание" hint="Необязательно">
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  aria-label="Описание товара"
                />
              </Field>
              {itemType === 'FLOWER' ? (
                <Field
                  label="Минимальный остаток"
                  hint="KPI «Ниже порога» на главной магазина; необязательно"
                >
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    value={minimumStock}
                    onChange={(e) => setMinimumStock(e.target.value)}
                    placeholder="Не задан"
                    aria-label="Минимальный остаток"
                  />
                </Field>
              ) : null}
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  minHeight: 40,
                  fontSize: 'var(--text-sm)',
                }}
              >
                <input
                  type="checkbox"
                  checked={isSellable}
                  onChange={(e) => setIsSellable(e.target.checked)}
                />
                Готовый букет (продаётся в магазине как готовая позиция)
              </label>
              <Button type="submit" disabled={creating}>
                {creating ? 'Создание…' : 'Создать'}
              </Button>
            </form>
          </Card>
        </Section>
      </PageContainer>
    </main>
  );
}
