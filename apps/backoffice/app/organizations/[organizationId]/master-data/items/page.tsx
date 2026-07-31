'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { useAuth } from '@/components/auth-provider';
import { CatalogExpandRow } from '@/components/catalog/catalog-expand-row';
import { getApiClient } from '@/lib/api-client';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';
import { Field } from '@/components/layout/field';
import { FancySelect } from '@/components/layout/fancy-select';
import { formatApiErrorMessage } from '@/lib/format-api-error';
import { catalogBreadcrumbs, canManageCatalog, canOperateCatalog } from '@/lib/settings-nav';
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
  const canOperate = canOperateCatalog(auth.hasPermission);
  const canManage = canManageCatalog(auth.hasPermission);

  const [items, setItems] = useState<Item[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [nameFilter, setNameFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('ACTIVE');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [thresholdDrafts, setThresholdDrafts] = useState<Record<string, string>>({});
  const [savingThresholdId, setSavingThresholdId] = useState<string | null>(null);

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
      setThresholdDrafts((prev) => {
        const next = { ...prev };
        for (const item of list.items) {
          if (next[item.id] === undefined) {
            next[item.id] = item.minimumStockQuantity ?? '';
          }
        }
        return next;
      });
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

  async function onArchive(itemId: string) {
    setError(null);
    try {
      await getApiClient().archiveItem(organizationId, itemId);
      if (expandedId === itemId) setExpandedId(null);
      await load();
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось архивировать'));
    }
  }

  async function onSaveThreshold(item: Item) {
    setSavingThresholdId(item.id);
    setError(null);
    try {
      const draft = thresholdDrafts[item.id] ?? '';
      await getApiClient().updateItem(organizationId, item.id, {
        minimumStockQuantity: draft.trim() ? draft.trim() : null,
      });
      await load();
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось сохранить порог'));
    } finally {
      setSavingThresholdId(null);
    }
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Товары"
          description="Цветы и материалы для закупок и сборки. Готовые букеты — в разделе «Букеты на витрине»."
          breadcrumbs={catalogBreadcrumbs(organizationId, { label: 'Товары' })}
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
              <EmptyState
                message={
                  canOperate
                    ? 'Товаров пока нет. Создайте первый товар ниже.'
                    : 'Товаров пока нет.'
                }
              />
            ) : null}
            <ul className="list-stack">
              {items.map((item) => (
                <li key={item.id}>
                  <CatalogExpandRow
                    expanded={expandedId === item.id}
                    onToggle={() =>
                      setExpandedId((current) => (current === item.id ? null : item.id))
                    }
                    title={
                      <>
                        {item.name} ({item.code})
                      </>
                    }
                    meta={
                      <div className="meta-row">
                        <StatusBadge status={itemTypeLabel(item.itemType)} />
                        <StatusBadge status={item.status} />
                        <span>
                          Добавил: {item.createdByDisplayName ?? 'неизвестно'}
                          {formatWhen(item.createdAt) ? ` · ${formatWhen(item.createdAt)}` : null}
                        </span>
                      </div>
                    }
                    actions={
                      canManage && item.status !== 'ARCHIVED' ? (
                        <Button variant="ghost" onClick={() => void onArchive(item.id)}>
                          Архив
                        </Button>
                      ) : undefined
                    }
                  >
                    {item.itemType === 'FLOWER' && item.status !== 'ARCHIVED' && canOperate ? (
                      <form
                        className="form-grid"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void onSaveThreshold(item);
                        }}
                      >
                        <Field label="Минимальный остаток" hint="KPI «Ниже порога» на главной магазина">
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            value={thresholdDrafts[item.id] ?? ''}
                            onChange={(event) =>
                              setThresholdDrafts((prev) => ({
                                ...prev,
                                [item.id]: event.target.value,
                              }))
                            }
                            placeholder="Не задан"
                          />
                        </Field>
                        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                          <Button type="submit" variant="secondary" disabled={savingThresholdId === item.id}>
                            {savingThresholdId === item.id ? 'Сохранение…' : 'Сохранить порог'}
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <p className="field__hint" style={{ margin: 0 }}>
                        Код: {item.code}
                      </p>
                    )}
                  </CatalogExpandRow>
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
