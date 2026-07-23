'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { ApiClientError } from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';

type Category = {
  id: string;
  name: string;
  code: string;
  parentId: string | null;
  status: string;
};

export default function CategoriesPage() {
  const params = useParams<{ organizationId: string }>();
  const organizationId = params.organizationId;
  const base = `/organizations/${organizationId}/master-data`;

  const [items, setItems] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [parentId, setParentId] = useState('');
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await getApiClient().listCategories(organizationId, 1, 100);
      setItems(res.items);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось загрузить');
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
    setCreating(true);
    setError(null);
    try {
      await getApiClient().createCategory(organizationId, {
        name,
        code,
        parentId: parentId || undefined,
      });
      setName('');
      setCode('');
      setParentId('');
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось создать');
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
      setError(err instanceof ApiClientError ? err.message : 'Не удалось архивировать');
    }
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Категории"
          description="Дерево категорий. Архивация запрещена при детях или активных товарах."
          breadcrumbs={[
            { label: 'Организации', href: '/organizations' },
            { label: 'Организация', href: `/organizations/${organizationId}` },
            { label: 'Справочники', href: base },
            { label: 'Категории' },
          ]}
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
                        {item.parentId ? (
                          <span style={{ fontSize: 'var(--text-xs)' }}>parent: {item.parentId}</span>
                        ) : (
                          <span style={{ fontSize: 'var(--text-xs)' }}>root</span>
                        )}
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
          </Card>
        </Section>
        <Section>
          <Card title="Создать категорию">
            <form onSubmit={onCreate} className="form-grid">
              <Input
                placeholder="Название"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                aria-label="Название категории"
              />
              <Input
                placeholder="Код"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                aria-label="Код категории"
              />
              <select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                aria-label="Родительская категория"
                style={{ minHeight: 40, borderRadius: 6, border: '1px solid var(--color-border)', padding: 8 }}
              >
                <option value="">Без родителя</option>
                {items
                  .filter((c) => c.status === 'ACTIVE')
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
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
