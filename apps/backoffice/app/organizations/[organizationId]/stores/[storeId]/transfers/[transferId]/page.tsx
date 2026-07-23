'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { ApiClientError, type TransferDto, type TransferTimelineDto } from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';

export default function TransferDetailPage() {
  const params = useParams<{ organizationId: string; storeId: string; transferId: string }>();
  const auth = useAuth();
  const { organizationId, storeId, transferId } = params;
  const base = `/organizations/${organizationId}/stores/${storeId}`;
  const [doc, setDoc] = useState<TransferDto | null>(null);
  const [timeline, setTimeline] = useState<TransferTimelineDto[]>([]);
  const [itemId, setItemId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = getApiClient();
      const [nextDoc, nextTimeline] = await Promise.all([
        client.getTransfer(organizationId, storeId, transferId),
        client.getTransferTimeline(organizationId, storeId, transferId),
      ]);
      setDoc(nextDoc);
      setTimeline(nextTimeline);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось загрузить перемещение');
    } finally {
      setLoading(false);
    }
  }, [organizationId, storeId, transferId]);

  useEffect(() => {
    if (!auth.hasPermission('transfers:read')) return;
    void load();
  }, [auth, load]);

  async function addItem() {
    try {
      const next = await getApiClient().addTransferItem(organizationId, storeId, transferId, {
        itemId,
        requestedQuantity: quantity,
      });
      setDoc(next);
      setItemId('');
      setQuantity('');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось добавить позицию');
    }
  }

  async function dispatch() {
    if (!doc) return;
    try {
      setDoc(await getApiClient().dispatchTransfer(
        organizationId,
        storeId,
        transferId,
        {
          expectedVersion: doc.version,
          items: doc.items.map((item) => ({
            transferItemId: item.id,
            dispatchQuantity: item.requestedQuantity,
          })),
        },
        crypto.randomUUID(),
      ));
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось отправить перемещение');
    }
  }

  async function receive() {
    if (!doc) return;
    try {
      setDoc(await getApiClient().receiveTransfer(
        organizationId,
        storeId,
        transferId,
        {
          expectedVersion: doc.version,
          allocations: doc.allocations.map((allocation) => ({
            transferAllocationId: allocation.id,
            transferItemId: allocation.transferItemId,
            itemId: allocation.toItemId ?? allocation.fromItemId,
            receivedQuantity: allocation.quantityDispatched,
            damagedQuantity: '0',
          })),
        },
        crypto.randomUUID(),
      ));
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось принять перемещение');
    }
  }

  async function cancel() {
    if (!doc) return;
    try {
      setDoc(await getApiClient().cancelTransfer(
        organizationId,
        storeId,
        transferId,
        { expectedVersion: doc.version },
        doc.status === 'DISPATCHED' ? crypto.randomUUID() : undefined,
      ));
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось отменить перемещение');
    }
  }

  async function reverse() {
    if (!doc) return;
    try {
      setDoc(await getApiClient().reverseTransfer(
        organizationId,
        storeId,
        transferId,
        { expectedVersion: doc.version },
        crypto.randomUUID(),
      ));
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось сторнировать перемещение');
    }
  }

  if (!auth.hasPermission('transfers:read')) {
    return <main><PageContainer><ErrorState message="Доступ запрещён: требуется transfers:read." /></PageContainer></main>;
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title={doc ? doc.number : 'Перемещение'}
          description="Отправка со склада-источника, приём на склад назначения."
          breadcrumbs={[
            { label: 'Магазин', href: base },
            { label: 'Перемещения', href: `${base}/transfers` },
            { label: doc?.number ?? 'Документ' },
          ]}
          actions={
            <div className="page-header__actions">
              <Button type="button" variant="secondary" onClick={() => void load()}>Обновить</Button>
              {doc?.status === 'DRAFT' && auth.hasPermission('transfers:dispatch') ? <Button type="button" onClick={() => void dispatch()}>Отправить</Button> : null}
              {doc?.status === 'DISPATCHED' && auth.hasPermission('transfers:receive') ? <Button type="button" onClick={() => void receive()}>Принять всё</Button> : null}
              {(doc?.status === 'DRAFT' || doc?.status === 'DISPATCHED') && auth.hasPermission('transfers:cancel') ? <Button type="button" variant="secondary" onClick={() => void cancel()}>Отменить</Button> : null}
              {doc?.status === 'RECEIVED' && auth.hasPermission('transfers:cancel') ? <Button type="button" variant="secondary" onClick={() => void reverse()}>Сторнировать</Button> : null}
            </div>
          }
        />

        {loading ? <LoadingState message="Загрузка перемещения…" /> : null}
        {error ? <ErrorState message={error} /> : null}

        {!loading && !error && doc ? (
          <>
            <Section>
              <Card title="Сводка">
                <div className="meta-row">
                  <StatusBadge status={doc.status} />
                  <span>{doc.fromWarehouseId} → {doc.toWarehouseId}</span>
                  <span>Версия {doc.version}</span>
                </div>
              </Card>
            </Section>

            {doc.status === 'DRAFT' && auth.hasPermission('transfers:create') ? (
              <Section>
                <Card title="Добавить позицию">
                  <div className="stock-filters">
                    <Input value={itemId} onChange={(e) => setItemId(e.target.value)} placeholder="UUID товара" />
                    <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Количество" />
                    <Button type="button" onClick={() => void addItem()} disabled={!itemId || !quantity}>Добавить позицию</Button>
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
                            <span>Запрошено {item.requestedQuantity}</span>
                            <span>Отправлено {item.dispatchedQuantity ?? '—'}</span>
                            <span>Получено {item.receivedQuantity ?? '—'}</span>
                            <span>Повреждено {item.damagedQuantity ?? '—'}</span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </Section>

            <Section>
              <Card title={`Timeline (${timeline.length})`}>
                {timeline.length === 0 ? (
                  <EmptyState message="История пока пуста." />
                ) : (
                  <ul className="stock-list">
                    {timeline.map((event) => (
                      <li key={event.id} className="stock-row">
                        <div>
                          <strong>{event.type}</strong>
                          <div className="meta-row">
                            <span>{event.message ?? '—'}</span>
                            <span>{new Date(event.occurredAt).toLocaleString()}</span>
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
