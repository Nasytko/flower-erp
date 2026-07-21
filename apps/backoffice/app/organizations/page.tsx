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
      setError(err instanceof ApiClientError ? err.message : 'Failed to load');
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
      setError(err instanceof ApiClientError ? err.message : 'Create failed');
    } finally {
      setCreating(false);
    }
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Organizations"
          description="Manage tenant organizations for Flower ERP."
          breadcrumbs={[{ label: 'Organizations' }]}
        />

        <Section>
          <Card title="All organizations">
            {loading ? <LoadingState message="Loading organizations…" /> : null}
            {error ? <ErrorState message={error} /> : null}
            {!loading && !error && items.length === 0 ? (
              <EmptyState message="Create the first organization to continue the vertical slice." />
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
          <Card title="Create organization">
            <form onSubmit={onCreate} className="form-grid">
              <label>
                <span className="visually-hidden">Organization name</span>
                <Input
                  placeholder="Organization name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={2}
                  aria-label="Organization name"
                />
              </label>
              <Button type="submit" disabled={creating || name.trim().length < 2}>
                {creating ? 'Creating…' : 'Create'}
              </Button>
            </form>
          </Card>
        </Section>
      </PageContainer>
    </main>
  );
}
