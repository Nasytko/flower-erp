'use client';

import Link from 'next/link';
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

type Supplier = {
  id: string;
  name: string;
  code: string;
  status: string;
  country: string | null;
};

export default function SuppliersPage() {
  const params = useParams<{ organizationId: string }>();
  const organizationId = params.organizationId;
  const base = `/organizations/${organizationId}/master-data`;

  const [items, setItems] = useState<Supplier[]>([]);
  const [nameFilter, setNameFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await getApiClient().listSuppliers(organizationId, {
        page: 1,
        pageSize: 50,
        name: nameFilter || undefined,
      });
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
      await getApiClient().createSupplier(organizationId, { name, code });
      setName('');
      setCode('');
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось создать');
    } finally {
      setCreating(false);
    }
  }

  async function onArchive(supplierId: string) {
    setError(null);
    try {
      await getApiClient().archiveSupplier(organizationId, supplierId);
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось архивировать');
    }
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Поставщики"
          description="Справочник поставщиков. Hard delete запрещён."
          breadcrumbs={[
            { label: 'Организации', href: '/organizations' },
            { label: 'Организация', href: `/organizations/${organizationId}` },
            { label: 'Справочники', href: base },
            { label: 'Поставщики' },
          ]}
        />
        <Section>
          <Card title="Поиск">
            <form
              className="form-grid"
              onSubmit={(e) => {
                e.preventDefault();
                void load();
              }}
            >
              <Input
                placeholder="Название"
                value={nameFilter}
                onChange={(e) => setNameFilter(e.target.value)}
                aria-label="Фильтр поставщиков по названию"
              />
              <Button type="submit" variant="secondary">
                Найти
              </Button>
            </form>
          </Card>
        </Section>
        <Section>
          <Card title="Список">
            {loading ? <LoadingState /> : null}
            {error ? <ErrorState message={error} /> : null}
            {!loading && items.length === 0 ? <EmptyState message="Поставщиков пока нет." /> : null}
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
                      <Link href={`${base}/suppliers/${item.id}`}>
                        <strong>
                          {item.name} ({item.code})
                        </strong>
                      </Link>
                      <div className="meta-row" style={{ marginTop: 4 }}>
                        <StatusBadge status={item.status} />
                        {item.country ? <span>{item.country}</span> : null}
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
          <Card title="Создать поставщика">
            <form onSubmit={onCreate} className="form-grid">
              <Input
                placeholder="Название"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                aria-label="Название поставщика"
              />
              <Input
                placeholder="Код"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                aria-label="Код поставщика"
              />
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
