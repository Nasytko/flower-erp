'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { useAuth } from '@/components/auth-provider';
import { DeletionRequestButton } from '@/components/admin/deletion-request-button';
import { getApiClient } from '@/lib/api-client';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { Field } from '@/components/layout/field';
import { FancySelect } from '@/components/layout/fancy-select';
import { DataTable, DataTableCellPrimary } from '@/components/layout/data-table';
import { EntityListFilters, EntityListPanel } from '@/components/layout/entity-list-panel';
import { StatusBadge } from '@/components/layout/status-badge';
import { formatApiErrorMessage } from '@/lib/format-api-error';
import { catalogBreadcrumbs, canOperateCatalog } from '@/lib/settings-nav';
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
  const auth = useAuth();
  const organizationId = params.organizationId;
  const base = `/organizations/${organizationId}/master-data`;
  const canOperate = canOperateCatalog(auth.hasPermission);

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
  const [minimumStock, setMinimumStock] = useState('');
  const [creating, setCreating] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await getApiClient().listItems(organizationId, {
        page,
        pageSize: 10,
        name: nameFilter || undefined,
        itemType: typeFilter || undefined,
        status: statusFilter || undefined,
        isSellable: false,
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
        isPurchasable: true,
        isSellable: false,
        minimumStockQuantity:
          itemType === 'FLOWER' && minimumStock.trim() ? minimumStock.trim() : undefined,
      });
      setName('');
      setDescription('');
      setMinimumStock('');
      await load();
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось создать товар'));
    } finally {
      setCreating(false);
    }
  }

  async function applyFilters() {
    setPage(1);
    await load();
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Товары"
          description="Цветы и материалы для закупок и сборки. Готовые букеты — в «Каталог букетов»."
          breadcrumbs={catalogBreadcrumbs(organizationId, { label: 'Товары' })}
        />

        <Section>
          <EntityListPanel
            title="Товары"
            count={items.length}
            loading={loading}
            error={error}
            isEmpty={!loading && !error && items.length === 0}
            emptyMessage={
              canOperate
                ? 'Товаров пока нет. Создайте первый товар ниже.'
                : 'Товаров пока нет.'
            }
            toolbar={
              <EntityListFilters
                onSubmit={() => {
                  void applyFilters();
                }}
              >
                <Field label="Название">
                  <Input
                    value={nameFilter}
                    onChange={(e) => setNameFilter(e.target.value)}
                    placeholder="Поиск…"
                    aria-label="Фильтр по названию"
                  />
                </Field>
                <Field label="Тип">
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    aria-label="Фильтр по типу"
                    className="entity-list-panel__select"
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
                    className="entity-list-panel__select"
                  >
                    <option value="">Все статусы</option>
                    <option value="ACTIVE">Активные</option>
                    <option value="ARCHIVED">В архиве</option>
                  </select>
                </Field>
                <Button type="submit" variant="secondary">
                  Применить
                </Button>
              </EntityListFilters>
            }
            footer={
              totalPages > 1 ? (
                <div className="meta-row">
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
              ) : null
            }
          >
            <DataTable
              rows={items}
              getRowKey={(item) => item.id}
              getRowHref={(item) => `${base}/items/${item.id}`}
              columns={[
                {
                  id: 'name',
                  header: 'Товар',
                  render: (item) => (
                    <DataTableCellPrimary title={item.name} subtitle={item.code} />
                  ),
                },
                {
                  id: 'type',
                  header: 'Тип',
                  render: (item) => <StatusBadge status={itemTypeLabel(item.itemType)} />,
                },
                {
                  id: 'status',
                  header: 'Статус',
                  render: (item) => <StatusBadge status={item.status} />,
                },
                {
                  id: 'threshold',
                  header: 'Мин. остаток',
                  render: (item) =>
                    item.itemType === 'FLOWER' ? item.minimumStockQuantity ?? '—' : '—',
                },
                {
                  id: 'author',
                  header: 'Добавил',
                  render: (item) => (
                    <DataTableCellPrimary
                      title={item.createdByDisplayName ?? '—'}
                      subtitle={formatWhen(item.createdAt) ?? undefined}
                    />
                  ),
                },
              ]}
              renderActions={(item) =>
                item.status === 'ACTIVE' ? (
                  <DeletionRequestButton
                    organizationId={organizationId}
                    entityType="ITEM"
                    entityId={item.id}
                    entityLabel={`${item.name} (${item.code})`}
                    onRequested={() => void load()}
                  />
                ) : null
              }
            />
          </EntityListPanel>
        </Section>

        {canOperate ? (
          <Section>
            <Card title="Создать товар">
              <form onSubmit={onCreate} className="form-grid" noValidate>
                <Field
                  label="Название"
                  required
                  error={fieldErrors.name}
                  hint="Цветок или материал для закупок, склада и сборки букетов"
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
                  hint="Цветок — партии и срок годности; материал — без партий"
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
                  <Field label="Минимальный остаток" hint="Необязательно">
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
                <Button type="submit" disabled={creating}>
                  {creating ? 'Создание…' : 'Создать'}
                </Button>
              </form>
            </Card>
          </Section>
        ) : null}
      </PageContainer>
    </main>
  );
}
