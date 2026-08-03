'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { useAuth } from '@/components/auth-provider';
import { getApiClient } from '@/lib/api-client';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { EntityListPanel } from '@/components/layout/entity-list-panel';
import { DataTable, DataTableCellPrimary } from '@/components/layout/data-table';
import { StatusBadge } from '@/components/layout/status-badge';
import { Field } from '@/components/layout/field';
import { FancySelect } from '@/components/layout/fancy-select';
import { DeletionRequestButton } from '@/components/admin/deletion-request-button';
import { formatApiErrorMessage } from '@/lib/format-api-error';
import { catalogBreadcrumbs, canOperateCatalog } from '@/lib/settings-nav';
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

  const parentName = (id: string | null) =>
    id ? (items.find((c) => c.id === id)?.name ?? 'родитель') : 'корневая';

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Категории"
          description="Дерево категорий товаров. Удаление возможно только без дочерних категорий и товаров."
          breadcrumbs={catalogBreadcrumbs(organizationId, { label: 'Категории' })}
        />
        <Section>
          <EntityListPanel
            title="Категории"
            count={items.length}
            loading={loading}
            error={error}
            isEmpty={!loading && !error && items.length === 0}
            emptyMessage="Категорий пока нет."
          >
            <DataTable
              rows={items}
              getRowKey={(item) => item.id}
              columns={[
                {
                  id: 'name',
                  header: 'Категория',
                  render: (item) => (
                    <DataTableCellPrimary title={item.name} subtitle={item.code} />
                  ),
                },
                {
                  id: 'parent',
                  header: 'Родитель',
                  render: (item) => parentName(item.parentId),
                },
                {
                  id: 'status',
                  header: 'Статус',
                  render: (item) => <StatusBadge status={item.status} />,
                },
              ]}
              renderActions={(item) =>
                item.status === 'ACTIVE' ? (
                  <DeletionRequestButton
                    organizationId={organizationId}
                    entityType="CATEGORY"
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
