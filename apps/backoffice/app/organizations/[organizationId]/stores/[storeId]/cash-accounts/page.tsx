'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card } from '@flower/ui';
import { ApiClientError } from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';

type CashAccount = Awaited<ReturnType<ReturnType<typeof getApiClient>['listCashAccounts']>>[number];
type CashOperation = Awaited<
  ReturnType<ReturnType<typeof getApiClient>['listCashAccountOperations']>
>[number];

export default function CashAccountsPage() {
  const params = useParams<{ organizationId: string; storeId: string }>();
  const auth = useAuth();
  const { organizationId, storeId } = params;
  const base = `/organizations/${organizationId}/stores/${storeId}`;

  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [operations, setOperations] = useState<CashOperation[]>([]);
  const [loading, setLoading] = useState(true);
  const [opsLoading, setOpsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadAccounts() {
    setLoading(true);
    setError(null);
    try {
      const list = await getApiClient().listCashAccounts(organizationId, storeId);
      setAccounts(list);
      setSelectedId((prev) => prev ?? list[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  async function loadOperations(cashAccountId: string) {
    setOpsLoading(true);
    setError(null);
    try {
      const list = await getApiClient().listCashAccountOperations(
        organizationId,
        storeId,
        cashAccountId,
      );
      setOperations(list);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load operations');
      setOperations([]);
    } finally {
      setOpsLoading(false);
    }
  }

  useEffect(() => {
    if (!auth.hasPermission('payments:view-cash')) return;
    void loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, storeId, auth]);

  useEffect(() => {
    if (!selectedId || !auth.hasPermission('payments:view-cash')) return;
    void loadOperations(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, organizationId, storeId, auth]);

  async function onEnsureDefault() {
    setBusy(true);
    setError(null);
    try {
      const account = await getApiClient().ensureDefaultCashAccount(organizationId, storeId);
      await loadAccounts();
      setSelectedId(account.id);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  if (!auth.hasPermission('payments:view-cash')) {
    return <p className="page-state">Access denied</p>;
  }

  const selected = accounts.find((a) => a.id === selectedId) ?? null;

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Касса"
          description="Кассовые счета и операции (только просмотр)."
          breadcrumbs={[
            { label: 'Organizations', href: '/organizations' },
            { label: 'Organization', href: `/organizations/${organizationId}` },
            { label: 'Store', href: base },
            { label: 'Касса' },
          ]}
          actions={
            <Button type="button" disabled={busy} onClick={() => void onEnsureDefault()}>
              Создать default
            </Button>
          }
        />

        <Section>
          {loading ? <LoadingState /> : null}
          {error ? <ErrorState message={error} /> : null}
        </Section>

        <Section>
          <Card title="Счета">
            {!loading && accounts.length === 0 ? (
              <EmptyState message="Счетов пока нет. Нажмите «Создать default»." />
            ) : null}
            <ul className="list-stack">
              {accounts.map((account) => (
                <li key={account.id}>
                  <button
                    type="button"
                    className="meta-row"
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      background: account.id === selectedId ? 'var(--color-surface-muted, #f5f5f5)' : 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '8px 0',
                    }}
                    onClick={() => setSelectedId(account.id)}
                  >
                    <strong>{account.name}</strong>
                    <StatusBadge status={account.type} />
                    <StatusBadge status={account.status} />
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </Section>

        <Section>
          <Card title={selected ? `Операции: ${selected.name}` : 'Операции'}>
            {!selected ? (
              <p style={{ margin: 0, color: 'var(--color-muted)' }}>Выберите счёт.</p>
            ) : opsLoading ? (
              <LoadingState />
            ) : operations.length === 0 ? (
              <EmptyState message="Операций пока нет." />
            ) : (
              <ul className="list-stack">
                {operations.map((op) => (
                  <li key={op.id}>
                    <div className="meta-row">
                      <StatusBadge status={op.type} />
                      <StatusBadge status={op.direction} />
                      <strong>{op.amount}</strong>
                      <span>{new Date(op.occurredAt).toLocaleString()}</span>
                    </div>
                    {op.comment ? <p style={{ margin: '4px 0 0' }}>{op.comment}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Section>
      </PageContainer>
    </main>
  );
}
