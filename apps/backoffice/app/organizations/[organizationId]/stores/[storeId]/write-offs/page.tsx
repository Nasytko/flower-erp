'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { ApiClientError, type WriteOffDto, type WriteOffReason } from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';
import { storeStockHint } from '@/lib/store-context';

const REASONS: WriteOffReason[] = [
  'WILTED',
  'BROKEN',
  'DAMAGED',
  'EXPIRED',
  'QUALITY_ISSUE',
  'THEFT',
  'INTERNAL_USE',
  'OTHER',
];

export default function WriteOffsPage() {
  const params = useParams<{ organizationId: string; storeId: string }>();
  const auth = useAuth();
  const { organizationId, storeId } = params;
  const base = `/organizations/${organizationId}/stores/${storeId}`;
  const [docs, setDocs] = useState<WriteOffDto[]>([]);
  const [storeName, setStoreName] = useState('');
  const [reason, setReason] = useState<WriteOffReason>('WILTED');
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = getApiClient();
      const [nextDocs, store] = await Promise.all([
        client.listWriteOffs(organizationId, storeId),
        client.getStore(organizationId, storeId),
      ]);
      setDocs(nextDocs);
      setStoreName(store.name);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось загрузить списания');
    } finally {
      setLoading(false);
    }
  }, [organizationId, storeId]);

  useEffect(() => {
    if (!auth.hasPermission('write-offs:read')) return;
    void load();
  }, [auth, load]);

  async function createDraft() {
    setCreating(true);
    setError(null);
    try {
      const doc = await getApiClient().createWriteOff(organizationId, storeId, {
        reason,
        comment: comment || undefined,
      });
      window.location.href = `${base}/write-offs/${doc.id}`;
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось создать списание');
    } finally {
      setCreating(false);
    }
  }

  if (!auth.hasPermission('write-offs:read')) {
    return <main><PageContainer><ErrorState message="Доступ запрещён: требуется write-offs:read." /></PageContainer></main>;
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Списания"
          description="Черновик, проведение и сторнирование списаний."
          breadcrumbs={[{ label: 'Магазин', href: base }, { label: 'Списания' }]}
          actions={
            <Button type="button" variant="secondary" onClick={() => void load()}>
              Обновить
            </Button>
          }
        />

        {loading ? <LoadingState message="Загрузка списаний…" /> : null}
        {error ? <ErrorState message={error} /> : null}

        {!loading && !error ? (
          <>
            {auth.hasPermission('write-offs:create') ? (
              <Section>
                <Card title="Создать списание">
                  <p className="field__hint">{storeStockHint(storeName)}</p>
                  <div className="stock-filters">
                    <label>
                      <div>Причина</div>
                      <select value={reason} onChange={(e) => setReason(e.target.value as WriteOffReason)}>
                        {REASONS.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label style={{ minWidth: 260 }}>
                      <div>Комментарий</div>
                      <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Комментарий (необязательно)" />
                    </label>
                    <Button type="button" onClick={() => void createDraft()} disabled={creating}>
                      {creating ? 'Создание…' : 'Создать черновик'}
                    </Button>
                  </div>
                </Card>
              </Section>
            ) : null}

            <Section>
              <Card title={`Документы (${docs.length})`}>
                {docs.length === 0 ? (
                  <EmptyState message="Списаний пока нет." />
                ) : (
                  <ul className="stock-list">
                    {docs.map((doc) => (
                      <li key={doc.id} className="stock-row">
                        <div>
                          <strong>
                            <Link href={`${base}/write-offs/${doc.id}`}>{doc.number}</Link>
                          </strong>
                          <div className="meta-row">
                            <StatusBadge status={doc.status} />
                            <span>{doc.reason}</span>
                            <span>Позиций {doc.items.length}</span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </Section>
          </>
        ) : null}
      </PageContainer>
    </main>
  );
}
