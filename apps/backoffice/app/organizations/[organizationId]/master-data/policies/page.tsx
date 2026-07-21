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

type Policy = {
  id: string;
  name: string;
  itemType: string;
  trackingMethod: string;
  expirationTracking: boolean;
  status: string;
};

export default function PoliciesPage() {
  const params = useParams<{ organizationId: string }>();
  const organizationId = params.organizationId;
  const base = `/organizations/${organizationId}/master-data`;

  const [items, setItems] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [itemType, setItemType] = useState<'FLOWER' | 'MATERIAL'>('FLOWER');
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await getApiClient().listPolicies(organizationId, 1, 100);
      setItems(res.items);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load');
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
      const isFlower = itemType === 'FLOWER';
      await getApiClient().createPolicy(organizationId, {
        name,
        itemType,
        trackingMethod: isFlower ? 'LOT' : 'NONE',
        expirationTracking: isFlower,
        defaultShelfLifeDays: isFlower ? 7 : undefined,
        reservationAllowed: false,
        allowFractionalQuantity: !isFlower,
      });
      setName('');
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Create failed');
    } finally {
      setCreating(false);
    }
  }

  async function onArchive(policyId: string) {
    setError(null);
    try {
      await getApiClient().archivePolicy(organizationId, policyId);
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Archive failed');
    }
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Политики учета"
          description="InventoryPolicy описывает правила учёта, но не хранит остатки."
          breadcrumbs={[
            { label: 'Organizations', href: '/organizations' },
            { label: 'Organization', href: `/organizations/${organizationId}` },
            { label: 'Справочники', href: base },
            { label: 'Политики' },
          ]}
        />
        <Section>
          <Card title="Список">
            {loading ? <LoadingState /> : null}
            {error ? <ErrorState message={error} /> : null}
            {!loading && items.length === 0 ? <EmptyState message="Политик пока нет." /> : null}
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
                      <strong>{item.name}</strong>
                      <div className="meta-row" style={{ marginTop: 4 }}>
                        <StatusBadge status={item.itemType} />
                        <StatusBadge status={item.trackingMethod} />
                        <StatusBadge status={item.status} />
                        <span style={{ fontSize: 'var(--text-xs)' }}>
                          expiry={String(item.expirationTracking)}
                        </span>
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
          <Card title="Создать политику">
            <p style={{ margin: '0 0 12px', color: 'var(--color-muted)', fontSize: 'var(--text-sm)' }}>
              FLOWER → LOT + expiration; MATERIAL → NONE без expiration.
            </p>
            <form onSubmit={onCreate} className="form-grid">
              <Input
                placeholder="Название"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                aria-label="Policy name"
              />
              <select
                value={itemType}
                onChange={(e) => setItemType(e.target.value as 'FLOWER' | 'MATERIAL')}
                aria-label="Policy item type"
                style={{ minHeight: 40, borderRadius: 6, border: '1px solid var(--color-border)', padding: 8 }}
              >
                <option value="FLOWER">FLOWER</option>
                <option value="MATERIAL">MATERIAL</option>
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
