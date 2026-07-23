'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { ApiClientError, type WriteOffDto } from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';

export default function WriteOffDetailPage() {
  const params = useParams<{ organizationId: string; storeId: string; writeOffId: string }>();
  const auth = useAuth();
  const { organizationId, storeId, writeOffId } = params;
  const base = `/organizations/${organizationId}/stores/${storeId}`;
  const [doc, setDoc] = useState<WriteOffDto | null>(null);
  const [itemId, setItemId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDoc(await getApiClient().getWriteOff(organizationId, storeId, writeOffId));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось загрузить списание');
    } finally {
      setLoading(false);
    }
  }, [organizationId, storeId, writeOffId]);

  useEffect(() => {
    if (!auth.hasPermission('write-offs:read')) return;
    void load();
  }, [auth, load]);

  async function addItem() {
    try {
      const next = await getApiClient().addWriteOffItem(organizationId, storeId, writeOffId, { itemId, quantity });
      setDoc(next);
      setItemId('');
      setQuantity('');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось добавить позицию');
    }
  }

  async function post() {
    try {
      setDoc(await getApiClient().postWriteOff(organizationId, storeId, writeOffId, crypto.randomUUID()));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось провести списание');
    }
  }

  async function reverse() {
    try {
      setDoc(await getApiClient().reverseWriteOff(organizationId, storeId, writeOffId, crypto.randomUUID()));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось сторнировать списание');
    }
  }

  if (!auth.hasPermission('write-offs:read')) {
    return <main><PageContainer><ErrorState message="Доступ запрещён: требуется write-offs:read." /></PageContainer></main>;
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title={doc ? doc.number : 'Write-off'}
          description="Проверьте строки, затем проведите или сторнируйте."
          breadcrumbs={[
            { label: 'Магазин', href: base },
            { label: 'Списания', href: `${base}/write-offs` },
            { label: doc?.number ?? 'Document' },
          ]}
          actions={
            <div className="page-header__actions">
              <Button type="button" variant="secondary" onClick={() => void load()}>
                Обновить
              </Button>
              {doc?.status === 'DRAFT' && auth.hasPermission('write-offs:post') ? (
                <Button type="button" onClick={() => void post()}>
                  Post
                </Button>
              ) : null}
              {doc?.status === 'POSTED' && auth.hasPermission('write-offs:reverse') ? (
                <Button type="button" variant="secondary" onClick={() => void reverse()}>
                  Reverse
                </Button>
              ) : null}
            </div>
          }
        />

        {loading ? <LoadingState message="Загрузка списания…" /> : null}
        {error ? <ErrorState message={error} /> : null}

        {!loading && !error && doc ? (
          <>
            <Section>
              <Card title="Сводка">
                <div className="meta-row">
                  <StatusBadge status={doc.status} />
                  <span>Причина {doc.reason}</span>
                  <span>Warehouse {doc.warehouseId}</span>
                  <span>Версия {doc.version}</span>
                </div>
                {doc.comment ? <p style={{ marginTop: 12 }}>{doc.comment}</p> : null}
              </Card>
            </Section>

            {doc.status === 'DRAFT' && auth.hasPermission('write-offs:create') ? (
              <Section>
                <Card title="Добавить позицию">
                  <div className="stock-filters">
                    <Input value={itemId} onChange={(e) => setItemId(e.target.value)} placeholder="UUID товара" />
                    <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Количество" />
                    <Button type="button" onClick={() => void addItem()} disabled={!itemId || !quantity}>
                      Add item
                    </Button>
                  </div>
                </Card>
              </Section>
            ) : null}

            <Section>
              <Card title={`Items (${doc.items.length})`}>
                {doc.items.length === 0 ? (
                  <EmptyState message="Позиций пока нет." />
                ) : (
                  <ul className="stock-list">
                    {doc.items.map((item) => (
                      <li key={item.id} className="stock-row">
                        <div>
                          <strong>{item.itemId}</strong>
                          <div className="meta-row">
                            <span>Qty {item.quantity}</span>
                            {item.unitCostSnapshot ? <span>Себестоимость {item.unitCostSnapshot}</span> : null}
                            {item.costAmountSnapshot ? <span>Amount {item.costAmountSnapshot}</span> : null}
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
