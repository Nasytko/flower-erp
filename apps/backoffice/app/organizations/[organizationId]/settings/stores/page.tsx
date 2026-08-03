'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { ApiClientError } from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { DataTable, DataTableCellPrimary } from '@/components/layout/data-table';
import { EntityListPanel } from '@/components/layout/entity-list-panel';
import { StatusBadge } from '@/components/layout/status-badge';
import { orgSettingsBreadcrumbs } from '@/lib/settings-nav';

type Org = { id: string; name: string; status: string };
type Store = {
  id: string;
  name: string;
  code: string;
  status: string;
  timezone: string;
  city?: string | null;
};

export default function SettingsStoresPage() {
  const params = useParams<{ organizationId: string }>();
  const auth = useAuth();
  const organizationId = params.organizationId;

  const [org, setOrg] = useState<Org | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [creating, setCreating] = useState(false);

  const base = `/organizations/${organizationId}`;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  async function onCreateStore(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await getApiClient().createStore(organizationId, {
        name,
        city: city.trim() || undefined,
      });
      setName('');
      setCity('');
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
          title="Магазины"
          description={org ? `Точки продаж организации «${org.name}».` : 'Точки продаж организации.'}
          breadcrumbs={orgSettingsBreadcrumbs(organizationId, { label: 'Магазины' })}
          actions={org ? <StatusBadge status={org.status} /> : undefined}
        />

        <Section>
          <EntityListPanel
            title="Магазины"
            count={stores.length}
            loading={loading}
            error={error}
            isEmpty={!loading && !error && stores.length === 0}
            emptyMessage="Магазинов пока нет."
          >
            <DataTable
              rows={stores}
              getRowKey={(store) => store.id}
              getRowHref={(store) => `${base}/stores/${store.id}/settings`}
              columns={[
                {
                  id: 'name',
                  header: 'Магазин',
                  render: (store) => (
                    <DataTableCellPrimary title={store.name} subtitle={store.code} />
                  ),
                },
                {
                  id: 'location',
                  header: 'Локация',
                  render: (store) => (
                    <DataTableCellPrimary
                      title={store.city ?? '—'}
                      subtitle={store.timezone}
                    />
                  ),
                },
                {
                  id: 'status',
                  header: 'Статус',
                  render: (store) => (
                    <div className="data-table__cell-badges">
                      <StatusBadge status={store.status} />
                    </div>
                  ),
                },
              ]}
              renderActions={(store) =>
                auth.hasPermission('stores:create') ? (
                  <Link href={`${base}/stores/${store.id}/settings`}>
                    <Button type="button" variant="ghost">
                      Настроить
                    </Button>
                  </Link>
                ) : null
              }
            />
          </EntityListPanel>
        </Section>

        {auth.hasPermission('stores:create') ? (
          <Section>
            <Card title="Новый магазин">
              <form onSubmit={onCreateStore} className="stack-form" noValidate>
                <div className="sale-custom-meta">
                  <label className="field">
                    <span className="field__label">
                      Название <span className="field__required">*</span>
                    </span>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      minLength={2}
                    />
                  </label>
                  <label className="field">
                    <span className="field__label">Город</span>
                    <Input
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Минск"
                    />
                  </label>
                </div>
                <Button type="submit" disabled={creating}>
                  {creating ? 'Создание…' : 'Создать магазин'}
                </Button>
              </form>
            </Card>
          </Section>
        ) : null}
      </PageContainer>
    </main>
  );
}
