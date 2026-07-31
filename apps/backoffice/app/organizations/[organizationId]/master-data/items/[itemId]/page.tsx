'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { getApiClient } from '@/lib/api-client';
import { FancySelect } from '@/components/layout/fancy-select';
import { Field } from '@/components/layout/field';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';
import { formatApiErrorMessage } from '@/lib/format-api-error';
import { masterDataBreadcrumbs } from '@/lib/settings-nav';

function itemTypeLabel(type: string) {
  return type === 'MATERIAL' ? 'Материал' : 'Цветок';
}

function formatWhen(value?: string) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('ru-RU');
  } catch {
    return value;
  }
}

function newRecipeKey() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `r_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

type RecipeDraftLine = {
  key: string;
  componentItemId: string;
  quantity: string;
};

type CatalogItem = {
  id: string;
  name: string;
  code: string;
  itemType: string;
};

export default function ItemDetailPage() {
  const params = useParams<{ organizationId: string; itemId: string }>();
  const { organizationId, itemId } = params;
  const base = `/organizations/${organizationId}/master-data`;

  const [item, setItem] = useState<{
    id: string;
    name: string;
    code: string;
    itemType: string;
    status: string;
    categoryId: string;
    unitId: string;
    inventoryPolicyId: string;
    description: string | null;
    isSellable?: boolean;
    isShowcase?: boolean;
    isPurchasable?: boolean;
    minimumStockQuantity?: string | null;
    createdAt?: string;
    createdByDisplayName?: string | null;
  } | null>(null);
  const [categoryName, setCategoryName] = useState<string | null>(null);
  const [policyName, setPolicyName] = useState<string | null>(null);
  const [minimumStock, setMinimumStock] = useState('');
  const [isShowcase, setIsShowcase] = useState(false);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [recipeLines, setRecipeLines] = useState<RecipeDraftLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingRecipe, setSavingRecipe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const componentOptions = useMemo(
    () =>
      catalog
        .filter((row) => row.itemType === 'FLOWER' || row.itemType === 'MATERIAL')
        .map((row) => ({
          value: row.id,
          label: row.name,
          hint: `${row.code} · ${itemTypeLabel(row.itemType)}`,
        })),
    [catalog],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const client = getApiClient();
    Promise.all([
      client.getItem(organizationId, itemId),
      client.listCategories(organizationId, 1, 100),
      client.listPolicies(organizationId, 1, 100),
      client.listItems(organizationId, { pageSize: 200, status: 'ACTIVE' }),
    ])
      .then(async ([data, cats, policies, itemsPage]) => {
        if (cancelled) return;
        setItem(data);
        setMinimumStock(data.minimumStockQuantity ?? '');
        setIsShowcase(Boolean(data.isShowcase));
        setCategoryName(cats.items.find((c) => c.id === data.categoryId)?.name ?? null);
        setPolicyName(policies.items.find((p) => p.id === data.inventoryPolicyId)?.name ?? null);
        setCatalog(itemsPage.items.filter((row) => row.id !== itemId));

        if (data.isSellable) {
          try {
            const recipe = await client.getItemRecipe(organizationId, itemId);
            if (!cancelled) {
              setRecipeLines(
                recipe.lines.map((line) => ({
                  key: line.id,
                  componentItemId: line.componentItemId,
                  quantity: line.quantity,
                })),
              );
            }
          } catch {
            if (!cancelled) setRecipeLines([]);
          }
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(formatApiErrorMessage(err, 'Не удалось загрузить'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, itemId]);

  async function onSaveShowcase(event: FormEvent) {
    event.preventDefault();
    if (!item || !item.isSellable) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await getApiClient().updateItem(organizationId, itemId, { isShowcase });
      setItem((current) => (current ? { ...current, isShowcase: updated.isShowcase } : current));
      setMessage('Настройки витрины сохранены');
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось сохранить'));
    } finally {
      setSaving(false);
    }
  }

  async function onSaveThreshold(event: FormEvent) {
    event.preventDefault();
    if (!item || item.itemType !== 'FLOWER') return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await getApiClient().updateItem(organizationId, itemId, {
        minimumStockQuantity: minimumStock.trim() ? minimumStock.trim() : null,
      });
      setItem((current) =>
        current
          ? { ...current, minimumStockQuantity: updated.minimumStockQuantity ?? null }
          : current,
      );
      setMinimumStock(updated.minimumStockQuantity ?? '');
      setMessage('Порог сохранён');
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось сохранить порог'));
    } finally {
      setSaving(false);
    }
  }

  async function onSaveRecipe(event: FormEvent) {
    event.preventDefault();
    if (!item?.isSellable) return;
    setSavingRecipe(true);
    setError(null);
    setMessage(null);
    try {
      const result = await getApiClient().setItemRecipe(organizationId, itemId, {
        lines: recipeLines
          .filter((line) => line.componentItemId && line.quantity.trim())
          .map((line) => ({
            componentItemId: line.componentItemId,
            quantity: line.quantity.trim(),
          })),
      });
      setRecipeLines(
        result.lines.map((line) => ({
          key: line.id,
          componentItemId: line.componentItemId,
          quantity: line.quantity,
        })),
      );
      setMessage('Рецепт сохранён');
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось сохранить рецепт'));
    } finally {
      setSavingRecipe(false);
    }
  }

  async function onArchive() {
    setError(null);
    try {
      const updated = await getApiClient().archiveItem(organizationId, itemId);
      setItem((current) => (current ? { ...current, status: updated.status } : current));
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось архивировать'));
    }
  }

  function addRecipeLine() {
    setRecipeLines((prev) => [...prev, { key: newRecipeKey(), componentItemId: '', quantity: '1' }]);
  }

  function updateRecipeLine(key: string, patch: Partial<Pick<RecipeDraftLine, 'componentItemId' | 'quantity'>>) {
    setRecipeLines((prev) =>
      prev.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  function removeRecipeLine(key: string) {
    setRecipeLines((prev) => prev.filter((line) => line.key !== key));
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title={item?.name ?? 'Товар'}
          description={item ? `Код ${item.code}` : 'Загрузка…'}
          breadcrumbs={masterDataBreadcrumbs(
            organizationId,
            { label: 'Товары', href: `${base}/items` },
            { label: item?.name ?? 'Товар' },
          )}
          actions={
            item && item.status !== 'ARCHIVED' ? (
              <Button variant="ghost" onClick={() => void onArchive()}>
                Архив
              </Button>
            ) : undefined
          }
        />
        {loading ? <LoadingState /> : null}
        {error ? <ErrorState message={error} /> : null}
        {message ? <p className="page-state">{message}</p> : null}
        {item ? (
          <>
            <Section>
              <Card title="Карточка товара">
                <div className="meta-row">
                  <StatusBadge status={itemTypeLabel(item.itemType)} />
                  <StatusBadge status={item.status} />
                  {item.isSellable ? <span className="sale-type-pill">Готовый букет</span> : null}
                  {item.isShowcase ? <span className="sale-type-pill">На витрине</span> : null}
                  {item.isPurchasable === false ? (
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>
                      Не закупается
                    </span>
                  ) : null}
                </div>
                <dl
                  style={{
                    marginTop: 16,
                    display: 'grid',
                    gap: 10,
                    fontSize: 'var(--text-sm)',
                  }}
                >
                  <div>
                    <dt style={{ color: 'var(--color-muted)' }}>Категория</dt>
                    <dd style={{ margin: 0 }}>{categoryName ?? item.categoryId}</dd>
                  </div>
                  <div>
                    <dt style={{ color: 'var(--color-muted)' }}>Политика учёта</dt>
                    <dd style={{ margin: 0 }}>{policyName ?? item.inventoryPolicyId}</dd>
                  </div>
                  <div>
                    <dt style={{ color: 'var(--color-muted)' }}>Кто добавил</dt>
                    <dd style={{ margin: 0 }}>{item.createdByDisplayName ?? 'неизвестно'}</dd>
                  </div>
                  <div>
                    <dt style={{ color: 'var(--color-muted)' }}>Когда добавлен</dt>
                    <dd style={{ margin: 0 }}>{formatWhen(item.createdAt)}</dd>
                  </div>
                </dl>
                {item.description ? <p style={{ marginTop: 16 }}>{item.description}</p> : null}
              </Card>
            </Section>

            {item.isSellable && item.status !== 'ARCHIVED' ? (
              <>
                <Section>
                  <Card title="Витрина">
                    <form onSubmit={(event) => void onSaveShowcase(event)} className="stack-form">
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          fontSize: 'var(--text-sm)',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isShowcase}
                          onChange={(event) => setIsShowcase(event.target.checked)}
                        />
                        На витрине — показывать при создании заказа
                      </label>
                      <Button type="submit" disabled={saving}>
                        {saving ? 'Сохранение…' : 'Сохранить'}
                      </Button>
                    </form>
                  </Card>
                </Section>

                <Section>
                  <Card title="Состав витрины (рецепт)">
                    <p style={{ marginTop: 0, color: 'var(--color-muted)', fontSize: 'var(--text-sm)' }}>
                      Этот состав подставится при выборе букета в заказе.
                    </p>
                    <form onSubmit={(event) => void onSaveRecipe(event)} className="stack-form">
                      {recipeLines.length === 0 ? (
                        <p className="field__hint">Добавьте строки рецепта — цветы и материалы.</p>
                      ) : (
                        <div className="stack-form">
                          {recipeLines.map((line) => (
                            <div key={line.key} className="sale-custom-meta">
                              <Field label="Компонент">
                                <FancySelect
                                  value={line.componentItemId}
                                  onChange={(value) =>
                                    updateRecipeLine(line.key, { componentItemId: value })
                                  }
                                  options={componentOptions}
                                  searchable
                                  placeholder="Цветок или материал"
                                />
                              </Field>
                              <Field label="Кол-во">
                                <Input
                                  value={line.quantity}
                                  onChange={(event) =>
                                    updateRecipeLine(line.key, { quantity: event.target.value })
                                  }
                                  inputMode="decimal"
                                />
                              </Field>
                              <Button
                                type="button"
                                variant="ghost"
                                onClick={() => removeRecipeLine(line.key)}
                              >
                                Удалить
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="meta-row">
                        <Button type="button" variant="secondary" onClick={addRecipeLine}>
                          Добавить строку
                        </Button>
                        <Button type="submit" disabled={savingRecipe}>
                          {savingRecipe ? 'Сохранение…' : 'Сохранить рецепт'}
                        </Button>
                      </div>
                    </form>
                  </Card>
                </Section>
              </>
            ) : null}

            {item.itemType === 'FLOWER' && item.status !== 'ARCHIVED' ? (
              <Section>
                <Card title="Порог остатка">
                  <p style={{ marginTop: 0, color: 'var(--color-muted)', fontSize: 'var(--text-sm)' }}>
                    Когда доступный остаток на складе магазина опускается до этого числа или ниже,
                    позиция попадает в KPI «Ниже порога» на главной.
                  </p>
                  <form onSubmit={(event) => void onSaveThreshold(event)}>
                    <Field label="Минимальный остаток">
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        value={minimumStock}
                        onChange={(event) => setMinimumStock(event.target.value)}
                        placeholder="Не задан"
                      />
                    </Field>
                    <div style={{ marginTop: 12 }}>
                      <Button type="submit" disabled={saving}>
                        {saving ? 'Сохранение…' : 'Сохранить'}
                      </Button>
                    </div>
                  </form>
                </Card>
              </Section>
            ) : null}
          </>
        ) : null}
      </PageContainer>
    </main>
  );
}
