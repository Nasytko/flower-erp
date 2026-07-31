'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button, Card, Input } from '@flower/ui';
import { useAuth } from '@/components/auth-provider';
import {
  BouquetCatalogCard,
  BouquetCatalogStat,
  type BouquetCatalogEntry,
} from '@/components/catalog/bouquet-catalog-card';
import type { RecipeCatalogItem } from '@/components/catalog/item-recipe-editor';
import { getApiClient } from '@/lib/api-client';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/states';
import { Field } from '@/components/layout/field';
import { formatApiErrorMessage } from '@/lib/format-api-error';
import { listAllCatalogItems } from '@/lib/catalog-items';
import { catalogBreadcrumbs, canOperateCatalog } from '@/lib/settings-nav';
import {
  type FieldErrors,
  firstFieldError,
  hasFieldErrors,
  requiredText,
} from '@/lib/form-validation';

export default function BouquetCatalogPage() {
  const params = useParams<{ organizationId: string }>();
  const searchParams = useSearchParams();
  const auth = useAuth();
  const organizationId = params.organizationId;
  const base = `/organizations/${organizationId}/master-data`;
  const canOperate = canOperateCatalog(auth.hasPermission);

  const [items, setItems] = useState<BouquetCatalogEntry[]>([]);
  const [catalog, setCatalog] = useState<RecipeCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

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
        listAllCatalogItems(client, organizationId, {
          status: 'ACTIVE',
          isSellable: false,
        }),
      ]);
      setItems(list);
      setCatalog(ingredients);
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось загрузить каталог букетов'));
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const expandId = searchParams.get('expand');
    if (expandId && items.some((item) => item.id === expandId)) {
      setExpandedId(expandId);
    }
  }, [searchParams, items]);

  const stats = useMemo(() => {
    const withoutRecipe = items.filter((item) => item.recipeLineCount === 0).length;
    return { total: items.length, withoutRecipe };
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) || item.code.toLowerCase().includes(q),
    );
  }, [items, query]);

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
        isShowcase: false,
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

  return (
    <main className="bouquet-catalog-page">
      <PageContainer>
        <PageHeader
          title="Каталог букетов"
          description="Шаблоны с рецептом для заказов и продаж. Состав виден всегда — все букеты доступны при оформлении."
          breadcrumbs={catalogBreadcrumbs(organizationId, { label: 'Каталог букетов' })}
        />

        {!loading && catalog.length === 0 ? (
          <Section>
            <Card title="Сначала добавьте ингредиенты">
              <p className="field__hint" style={{ margin: 0 }}>
                Для состава букета нужны цветы и материалы в{' '}
                <Link href={`${base}/items`}>Справочник → Товары</Link>.
              </p>
            </Card>
          </Section>
        ) : null}

        {canOperate ? (
          <Section>
            <Card title="Новый букет">
              <p className="field__hint" style={{ marginTop: 0 }}>
                После создания карточка раскроется — задайте состав из цветов и материалов.
              </p>
              <form onSubmit={onCreate} className="form-grid bouquet-catalog-create__form" noValidate>
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
                <div className="bouquet-catalog-create__actions">
                  <Button type="submit" disabled={creating}>
                    {creating ? 'Создание…' : 'Создать букет'}
                  </Button>
                </div>
              </form>
            </Card>
          </Section>
        ) : null}

        <Section>
          <Card title="Букеты">
            {loading ? <LoadingState /> : null}
            {error ? <ErrorState message={error} /> : null}

            {!loading && items.length > 0 ? (
              <>
                <div className="bouquet-catalog-stats">
                  <BouquetCatalogStat label="Всего" value={stats.total} />
                  <BouquetCatalogStat
                    label="Без состава"
                    value={stats.withoutRecipe}
                    hint={stats.withoutRecipe > 0 ? 'нужен рецепт' : undefined}
                  />
                </div>
                <Field label="Поиск">
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Название или код…"
                    aria-label="Поиск букета"
                  />
                </Field>
              </>
            ) : null}

            {!loading && items.length === 0 ? (
              <EmptyState
                message={
                  canOperate
                    ? 'Каталог пуст. Создайте первый букет выше и задайте состав.'
                    : 'В каталоге пока нет букетов.'
                }
              />
            ) : null}

            {!loading && items.length > 0 && filteredItems.length === 0 ? (
              <p className="sale-cells__empty">Ничего не найдено по запросу</p>
            ) : null}

            <div className="bouquet-catalog-list">
              {filteredItems.map((item) => (
                <BouquetCatalogCard
                  key={item.id}
                  bouquet={item}
                  expanded={expandedId === item.id}
                  onToggle={() =>
                    setExpandedId((current) => (current === item.id ? null : item.id))
                  }
                  canEdit={canOperate}
                  organizationId={organizationId}
                  catalog={catalog}
                  onRecipeSaved={() => void load()}
                />
              ))}
            </div>
          </Card>
        </Section>
      </PageContainer>
    </main>
  );
}
