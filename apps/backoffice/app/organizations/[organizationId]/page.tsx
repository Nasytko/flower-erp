'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { ApiClientError } from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';

type Org = { id: string; name: string; status: string };
type Store = { id: string; name: string; code: string; status: string; timezone: string };

export default function OrganizationDetailPage() {
  const params = useParams<{ organizationId: string }>();
  const router = useRouter();
  const organizationId = params.organizationId;

  const [org, setOrg] = useState<Org | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const client = getApiClient();
      const [organization, storeList] = await Promise.all([
        client.getOrganization(organizationId),
        client.listStores(organizationId),
      ]);
      setOrg(organization);
      setStores(storeList.items);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось загрузить');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // intentional: load on organization change only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  async function onCreateStore(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await getApiClient().createStore(organizationId, { name, code });
      setName('');
      setCode('');
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось создать магазин');
    } finally {
      setCreating(false);
    }
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title={org?.name ?? 'Организация'}
          description={org ? `ID ${org.id}` : 'Загрузка данных организации…'}
          breadcrumbs={[
            { label: 'Организации', href: '/organizations' },
            { label: org?.name ?? 'Подробности' },
          ]}
          actions={org ? <StatusBadge status={org.status} /> : undefined}
        />

        {!loading && !error ? (
          <Section>
            <Card title="Справочники (Master Data)">
              <p style={{ margin: '0 0 12px', color: 'var(--color-muted)', fontSize: 'var(--text-sm)' }}>
                Товары, категории, единицы, поставщики и политики учета — без остатков и поставок.
              </p>
              <Button
                type="button"
                variant="secondary"
                onClick={() => router.push(`/organizations/${organizationId}/master-data`)}
              >
                Открыть справочники
              </Button>
            </Card>
          </Section>
        ) : null}

        {loading ? <LoadingState message="Загрузка организации…" /> : null}
        {error ? <ErrorState message={error} /> : null}

        {!loading && !error ? (
          <>
            <Section>
              <Card title="Магазины">
                {stores.length === 0 ? (
                  <EmptyState message="Магазинов пока нет. При создании магазина также создаётся склад по умолчанию." />
                ) : (
                  <ul className="list-stack">
                    {stores.map((store) => (
                      <li key={store.id}>
                        <Link href={`/organizations/${organizationId}/stores/${store.id}`}>
                          <div className="meta-row" style={{ marginBottom: 4 }}>
                            <strong style={{ color: 'var(--color-foreground)' }}>
                              {store.name} ({store.code})
                            </strong>
                            <StatusBadge status={store.status} />
                          </div>
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>
                            {store.timezone}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </Section>

            <Section>
              <Card title="Создать магазин">
                <p style={{ margin: '0 0 12px', color: 'var(--color-muted)', fontSize: 'var(--text-sm)' }}>
                  Создаёт магазин со складом по умолчанию.
                </p>
                <form onSubmit={onCreateStore} className="form-grid">
                  <Input
                    placeholder="Название магазина"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    minLength={2}
                    aria-label="Название магазина"
                  />
                  <Input
                    placeholder="Код (например, MSK-01)"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                    minLength={2}
                    aria-label="Код магазина"
                  />
                  <Button type="submit" disabled={creating}>
                    {creating ? 'Создание…' : 'Создать магазин'}
                  </Button>
                </form>
              </Card>
            </Section>
          </>
        ) : null}
      </PageContainer>
    </main>
  );
}
