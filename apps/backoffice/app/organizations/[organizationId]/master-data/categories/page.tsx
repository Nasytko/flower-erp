'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { useAuth } from '@/components/auth-provider';
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

type Category = {
  id: string;
  name: string;
  code: string;
  parentId: string | null;
  status: string;
};

export default function CategoriesPage() {
  const params = useParams<{ organizationId: string }>();
  const auth = useAuth();
  const organizationId = params.organizationId;
  const canOperate = canOperateCatalog(auth.hasPermission);
  const canManage = canManageCatalog(auth.hasPermission);

  const [items, setItems] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [creating, setCreating] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await getApiClient().listCategories(organizationId, 1, 100);
      setItems(res.items);
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось загрузить'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

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
      await getApiClient().createCategory(organizationId, {
        name,
        parentId: parentId || undefined,
      });
      setName('');
      setParentId('');
      await load();
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось создать'));
    } finally {
      setCreating(false);
    }
  }

  async function onArchive(categoryId: string) {
    setError(null);
    try {
      await getApiClient().archiveCategory(organizationId, categoryId);
      await load();
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось архивировать'));
    }
  }

  const parentName = (id: string | null) =>
    id ? (items.find((c) => c.id === id)?.name ?? 'родитель') : 'корневая';

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Категории"
          description="Дерево категорий товаров. Архивация запрещена, если есть дочерние категории или товары."
          breadcrumbs={catalogBreadcrumbs(organizationId, { label: 'Категории' })}
        />
        <Section>
          <Card title="Список">
            {loading ? <LoadingState /> : null}
            {error ? <ErrorState message={error} /> : null}
            {!loading && items.length === 0 ? <EmptyState message="Категорий пока нет." /> : null}
            <ul className="list-stack">
              {items.map((item) => (
                <li key={item.id}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      flexWrap: 'wrap',
                      padding: 12,
                      border: '1px solid var(--color-border)',
                      borderRadius: 10,
                      background: 'var(--color-surface)',
                    }}
                  >
                    <div>
                      <strong>
                        {item.name} ({item.code})
                      </strong>
                      <div className="meta-row" style={{ marginTop: 4 }}>
                        <StatusBadge status={item.status} />
                        <span style={{ fontSize: 'var(--text-xs)' }}>{parentName(item.parentId)}</span>
                      </div>
                    </div>
                    {canManage && item.status !== 'ARCHIVED' ? (
                      <Button variant="ghost" onClick={() => void onArchive(item.id)}>
                        Архив
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </Section>
        {canOperate ? (
        <Section>
          <Card title="Создать категорию">
            <form onSubmit={onCreate} className="form-grid" noValidate>
              <Field
                label="Название"
                required
                error={fieldErrors.name}
                hint="Как категория отображается в справочнике товаров"
              >
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={2}
                  aria-label="Название категории"
                />
              </Field>
              <Field label="Родительская категория" hint="Оставьте пустым для корневой категории">
                <FancySelect
                  value={parentId}
                  onChange={setParentId}
                  options={[
                    { value: '', label: 'Без родителя (корневая)' },
                    ...items
                      .filter((c) => c.status === 'ACTIVE')
                      .map((c) => ({ value: c.id, label: c.name })),
                  ]}
                  searchable
                  aria-label="Родительская категория"
                />
              </Field>
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
