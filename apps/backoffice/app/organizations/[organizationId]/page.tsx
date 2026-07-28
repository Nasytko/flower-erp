'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { ApiClientError } from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { DocRef } from '@/components/layout/doc-ref';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { SettingsLinks } from '@/components/layout/settings-links';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';

type Org = { id: string; name: string; status: string };
type Store = {
  id: string;
  name: string;
  code: string;
  status: string;
  timezone: string;
  city?: string | null;
};

export default function OrganizationDetailPage() {
  const params = useParams<{ organizationId: string }>();
  const router = useRouter();
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
  const adminLinks = useMemo(
    () =>
      [
        auth.hasPermission('users:read')
          ? {
              href: `${base}/users`,
              label: 'Пользователи',
              description: 'Роли, доступ к магазинам, блокировки',
            }
          : null,
        auth.hasPermission('organization:read')
          ? {
              href: `${base}/integrations`,
              label: 'Карты и навигация',
              description: 'Яндекс.Карты и подсказки адресов',
            }
          : null,
        auth.hasPermission('audit:read')
          ? {
              href: `${base}/audit`,
              label: 'Журнал действий',
              description: 'Аудит изменений',
            }
          : null,
      ].filter((item): item is { href: string; label: string; description: string } => item != null),
    [auth, base],
  );

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
          title={org?.name ?? 'Организация'}
          breadcrumbs={[
            { label: 'Организации', href: '/organizations' },
            { label: org?.name ?? 'Подробности' },
          ]}
          actions={org ? <StatusBadge status={org.status} /> : undefined}
        />

        {adminLinks.length > 0 ? (
          <Section>
            <SettingsLinks links={adminLinks} title="Администрирование" />
          </Section>
        ) : null}

        {!loading && !error ? (
          <Section>
            <Card title="Справочники">
              <Button
                type="button"
                variant="secondary"
                onClick={() => router.push(`${base}/master-data`)}
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
                  <EmptyState message="Магазинов пока нет." />
                ) : (
                  <ul className="list-stack org-store-list">
                    {stores.map((store) => (
                      <li key={store.id} className="org-store-list__item">
                        <div className="org-store-list__main">
                          <Link href={`${base}/stores/${store.id}`} className="org-store-list__link">
                            <div className="list-row__primary">
                              <strong>{store.name}</strong>
                              <DocRef>{store.code}</DocRef>
                            </div>
                            <span className="org-store-list__meta">{store.timezone}</span>
                          </Link>
                        </div>
                        <div className="org-store-list__aside">
                          <StatusBadge status={store.status} />
                          {auth.hasPermission('stores:create') ? (
                            <Link href={`${base}/stores/${store.id}/settings`}>
                              <Button type="button" variant="ghost">
                                Настройки
                              </Button>
                            </Link>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
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
          </>
        ) : null}
      </PageContainer>
    </main>
  );
}
