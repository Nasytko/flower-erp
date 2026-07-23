'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { Button, Card, Input } from '@flower/ui';
import { ApiClientError } from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';

type Org = { id: string; name: string; status: string; createdAt: string };

export default function OrganizationsPage() {
  const [items, setItems] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await getApiClient().listOrganizations();
      setItems(res.items);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось загрузить');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await getApiClient().createOrganization({ name });
      setName('');
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось создать');
    } finally {
      setCreating(false);
    }
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Организации"
          description="Управление организациями-арендаторами Flower ERP."
          breadcrumbs={[{ label: 'Организации' }]}
        />

        <Section>
          <Card title="Все организации">
            {loading ? <LoadingState message="Загрузка организаций…" /> : null}
            {error ? <ErrorState message={error} /> : null}
            {!loading && !error && items.length === 0 ? (
              <EmptyState message="Создайте первую организацию, чтобы продолжить вертикальный срез." />
            ) : null}
            {!loading && items.length > 0 ? (
              <ul className="list-stack">
                {items.map((org) => (
                  <li key={org.id}>
                    <Link href={`/organizations/${org.id}`}>
                      <div className="meta-row" style={{ marginBottom: 4 }}>
                        <strong style={{ color: 'var(--color-foreground)' }}>{org.name}</strong>
                        <StatusBadge status={org.status} />
                      </div>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>
                        {org.id}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>
        </Section>

        <Section>
          <Card title="Создать организацию">
            <form onSubmit={onCreate} className="form-grid">
              <label>
                <span className="visually-hidden">Название организации</span>
                <Input
                  placeholder="Название организации"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={2}
                  aria-label="Название организации"
                />
              </label>
              <Button type="submit" disabled={creating || name.trim().length < 2}>
                {creating ? 'Создание…' : 'Создать'}
              </Button>
            </form>
          </Card>
        </Section>
      </PageContainer>
    </main>
  );
}
