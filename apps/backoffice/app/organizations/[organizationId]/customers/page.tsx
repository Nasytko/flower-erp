'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ApiClientError } from '@flower/api-client';
import { Button, Card, Input } from '@flower/ui';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';

type CustomerRow = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  status: string;
};

export default function CustomersPage() {
  const params = useParams<{ organizationId: string }>();
  const auth = useAuth();
  const organizationId = params.organizationId;

  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const rows = await getApiClient().listCustomers(organizationId);
      setCustomers(rows);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось загрузить клиентов');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!auth.hasPermission('customers:read')) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth, organizationId]);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await getApiClient().createCustomer(organizationId, {
        name,
        phone,
        email: email || undefined,
        notes: notes || undefined,
      });
      setName('');
      setPhone('');
      setEmail('');
      setNotes('');
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось создать клиента');
    } finally {
      setCreating(false);
    }
  }

  async function onArchive(customerId: string) {
    setBusyId(customerId);
    setError(null);
    try {
      await getApiClient().archiveCustomer(organizationId, customerId);
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось архивировать клиента');
    } finally {
      setBusyId(null);
    }
  }

  if (!auth.hasPermission('customers:read')) {
    return <p className="page-state">Доступ запрещён</p>;
  }

  const canManage = auth.hasPermission('customers:manage');

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Клиенты"
          description="Клиенты организации: телефон уникален, архив вместо удаления."
          breadcrumbs={[
            { label: 'Организации', href: '/organizations' },
            { label: 'Организация', href: `/organizations/${organizationId}` },
            { label: 'Клиенты' },
          ]}
        />

        {loading ? <LoadingState /> : null}
        {error ? <ErrorState message={error} /> : null}

        {canManage ? (
          <Section>
            <Card title="Новый клиент">
              <form onSubmit={onCreate} className="stack-form">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Имя"
                  required
                />
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Телефон"
                  required
                />
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email (опционально)"
                />
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Заметки"
                />
                <Button type="submit" disabled={creating || !name.trim() || !phone.trim()}>
                  {creating ? 'Создание…' : 'Создать'}
                </Button>
              </form>
            </Card>
          </Section>
        ) : null}

        <Section>
          <Card title="Список клиентов">
            {!loading && customers.length === 0 ? (
              <EmptyState message="Клиентов пока нет." />
            ) : null}
            <ul className="list-stack">
              {customers.map((customer) => (
                <li key={customer.id}>
                  <div className="meta-row">
                    <strong>{customer.name}</strong>
                    <span>{customer.phone}</span>
                    {customer.email ? <span>{customer.email}</span> : null}
                    <StatusBadge status={customer.status} />
                    {canManage && customer.status !== 'ARCHIVED' ? (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={busyId === customer.id}
                        onClick={() => void onArchive(customer.id)}
                      >
                        Архив
                      </Button>
                    ) : null}
                  </div>
                  {customer.notes ? <p style={{ margin: '4px 0 0' }}>{customer.notes}</p> : null}
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      </PageContainer>
    </main>
  );
}
