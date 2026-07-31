'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { useAuth } from '@/components/auth-provider';
import { CatalogExpandRow } from '@/components/catalog/catalog-expand-row';
import { ItemRecipeEditor, type RecipeCatalogItem } from '@/components/catalog/item-recipe-editor';
import { getApiClient } from '@/lib/api-client';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/states';
import { Field } from '@/components/layout/field';
import { formatApiErrorMessage } from '@/lib/format-api-error';
import { catalogBreadcrumbs, canOperateCatalog } from '@/lib/settings-nav';
import {
  type FieldErrors,
  firstFieldError,
  hasFieldErrors,
  requiredText,
} from '@/lib/form-validation';

type ShowcaseBouquet = {
  id: string;
  name: string;
  code: string;
  previewLines: Array<{ componentName: string; quantity: string }>;
  previewMoreCount: number;
};

export default function ShowcaseBouquetsPage() {
  const params = useParams<{ organizationId: string }>();
  const auth = useAuth();
  const organizationId = params.organizationId;
  const canOperate = canOperateCatalog(auth.hasPermission);

  const [items, setItems] = useState<ShowcaseBouquet[]>([]);
  const [catalog, setCatalog] = useState<RecipeCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showcaseFlags, setShowcaseFlags] = useState<Record<string, boolean>>({});
  const [savingShowcaseId, setSavingShowcaseId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = getApiClient();
      const [list, ingredients] = await Promise.all([
        client.listShowcaseBouquets(organizationId),
        client.listItems(organizationId, {
          pageSize: 200,
          status: 'ACTIVE',
          isSellable: false,
        }),
      ]);
      setItems(list);
      setCatalog(ingredients.items);
      const details = await Promise.all(
        list.map((item) => client.getItem(organizationId, item.id).catch(() => null)),
      );
      setShowcaseFlags((prev) => {
        const next = { ...prev };
        for (const detail of details) {
          if (detail) next[detail.id] = Boolean(detail.isShowcase);
        }
        return next;
      });
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось загрузить букеты'));
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    const errors: FieldErrors = {
      name: requiredText(name, 'Укажите название букета'),
    };
    setFieldErrors(errors);
    if (hasFieldErrors(errors)) {
      setError(firstFieldError(errors));
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const created = await getApiClient().createItem(organizationId, {
        name,
        description: description || undefined,
        itemType: 'FLOWER',
        isSellable: true,
        isShowcase: true,
        isPurchasable: false,
      });
      setName('');
      setDescription('');
      setExpandedId(created.id);
      await load();
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось создать букет'));
    } finally {
      setCreating(false);
    }
  }

  async function onSaveShowcase(itemId: string) {
    setSavingShowcaseId(itemId);
    setError(null);
    try {
      await getApiClient().updateItem(organizationId, itemId, {
        isShowcase: showcaseFlags[itemId] ?? false,
      });
      await load();
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось сохранить настройки витрины'));
    } finally {
      setSavingShowcaseId(null);
    }
  }

  function previewText(item: ShowcaseBouquet) {
    if (item.previewLines.length === 0) {
      return 'Состав не задан — раскройте и добавьте цветы и материалы';
    }
    const lines = item.previewLines
      .map((line) => `${line.componentName} × ${line.quantity}`)
      .join(' · ');
    return item.previewMoreCount > 0 ? `${lines} · ещё ${item.previewMoreCount}` : lines;
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Букеты на витрине"
          description="Готовые рецепты для заказов и продаж. Букет — это шаблон: со склада списываются цветы и материалы из состава."
          breadcrumbs={catalogBreadcrumbs(organizationId, { label: 'Букеты на витрине' })}
        />

        <Section>
          <Card title="Список">
            {loading ? <LoadingState /> : null}
            {error ? <ErrorState message={error} /> : null}
            {!loading && items.length === 0 ? (
              <EmptyState
                message={
                  canOperate
                    ? 'Букетов на витрине пока нет. Создайте первый ниже и задайте состав.'
                    : 'Букетов на витрине пока нет.'
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
                    meta={<span>{previewText(item)}</span>}
                  >
                    {canOperate ? (
                      <>
                        <label
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            marginBottom: 12,
                            fontSize: 'var(--text-sm)',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={showcaseFlags[item.id] ?? true}
                            onChange={(event) =>
                              setShowcaseFlags((prev) => ({
                                ...prev,
                                [item.id]: event.target.checked,
                              }))
                            }
                          />
                          Показывать при создании заказа («Букет с витрины»)
                        </label>
                        <div className="meta-row" style={{ marginBottom: 12 }}>
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={savingShowcaseId === item.id}
                            onClick={() => void onSaveShowcase(item.id)}
                          >
                            {savingShowcaseId === item.id ? 'Сохранение…' : 'Сохранить витрину'}
                          </Button>
                        </div>
                        <ItemRecipeEditor
                          organizationId={organizationId}
                          itemId={item.id}
                          catalog={catalog}
                          canEdit={canOperate}
                          onSaved={() => void load()}
                        />
                      </>
                    ) : (
                      <p className="field__hint" style={{ margin: 0 }}>
                        {previewText(item)}
                      </p>
                    )}
                  </CatalogExpandRow>
                </li>
              ))}
            </ul>
          </Card>
        </Section>

        {canOperate ? (
          <Section>
            <Card title="Добавить букет">
              <p className="field__hint" style={{ marginTop: 0 }}>
                После создания строка раскроется — укажите состав из цветов и материалов.
              </p>
              <form onSubmit={onCreate} className="form-grid" noValidate>
                <Field label="Название" required error={fieldErrors.name}>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    minLength={2}
                    placeholder="Например, Букет «Нежность»"
                    aria-label="Название букета"
                  />
                </Field>
                <Field label="Описание" hint="Необязательно">
                  <Input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    aria-label="Описание букета"
                  />
                </Field>
                <Button type="submit" disabled={creating}>
                  {creating ? 'Создание…' : 'Создать букет'}
                </Button>
              </form>
            </Card>
          </Section>
        ) : null}
      </PageContainer>
    </main>
  );
}
