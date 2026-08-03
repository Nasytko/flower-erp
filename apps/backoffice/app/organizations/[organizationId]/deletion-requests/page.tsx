'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@flower/ui';
import type { DeletionRequestDto } from '@flower/api-client';
import { useAuth } from '@/components/auth-provider';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { DataTable, DataTableCellPrimary } from '@/components/layout/data-table';
import { EntityListPanel } from '@/components/layout/entity-list-panel';
import { StatusBadge } from '@/components/layout/status-badge';
import { getApiClient } from '@/lib/api-client';
import { DELETION_ENTITY_LABELS_RU } from '@/lib/deletion-labels';
import { formatApiErrorMessage } from '@/lib/format-api-error';
import { orgSettingsHubHref } from '@/lib/settings-nav';

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString('ru-RU');
  } catch {
    return iso;
  }
}

export default function DeletionRequestsPage() {
  const params = useParams<{ organizationId: string }>();
  const auth = useAuth();
  const organizationId = params.organizationId;
  const canApprove = auth.hasPermission('deletions:approve');

  const [items, setItems] = useState<DeletionRequestDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await getApiClient().listDeletionRequests(
        organizationId,
        showAll ? undefined : { status: 'PENDING' },
      );
      setItems(list);
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось загрузить очередь удаления'));
    } finally {
      setLoading(false);
    }
  }, [organizationId, showAll]);

  useEffect(() => {
    if (!auth.hasPermission('deletions:read')) return;
    void load();
  }, [auth, load]);

  async function review(requestId: string, action: 'approve' | 'reject') {
    const comment = window.prompt(
      action === 'approve'
        ? 'Комментарий к удалению (необязательно):'
        : 'Причина отклонения (необязательно):',
    );
    if (comment === null) return;

    setBusyId(requestId);
    setError(null);
    try {
      const client = getApiClient();
      if (action === 'approve') {
        await client.approveDeletionRequest(organizationId, requestId, {
          comment: comment.trim() || undefined,
        });
      } else {
        await client.rejectDeletionRequest(organizationId, requestId, {
          comment: comment.trim() || undefined,
        });
      }
      await load();
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось обработать запрос'));
    } finally {
      setBusyId(null);
    }
  }

  if (!auth.hasPermission('deletions:read')) {
    return <p className="page-state">Доступ запрещён</p>;
  }

  const pending = items.filter((row) => row.status === 'PENDING');

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Очередь удаления"
          description="Запросы на безвозвратное удаление записей. Подтверждают директор или разработчик."
          breadcrumbs={[
            { label: 'Настройки ERP', href: orgSettingsHubHref(organizationId) },
            { label: 'Очередь удаления' },
          ]}
          actions={
            <Button type="button" variant="secondary" onClick={() => void load()} disabled={loading}>
              Обновить
            </Button>
          }
        />

        <Section>
          <EntityListPanel
            title={showAll ? 'Все запросы' : 'Ожидают подтверждения'}
            count={items.length}
            loading={loading}
            error={error}
            isEmpty={!loading && !error && items.length === 0}
            emptyMessage="Запросов на удаление пока нет."
            toolbar={
              <div className="entity-list-panel__filters">
                <p className="field__hint" style={{ margin: 0, flex: 1 }}>
                  {pending.length > 0
                    ? `${pending.length} запрос(ов) ждут решения.`
                    : 'Нет ожидающих запросов.'}
                </p>
                <Button type="button" variant="secondary" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? 'Только ожидающие' : 'Показать историю'}
                </Button>
              </div>
            }
          >
            <DataTable
              rows={items}
              getRowKey={(row) => row.id}
              columns={[
                {
                  id: 'entity',
                  header: 'Запись',
                  render: (row) => (
                    <DataTableCellPrimary
                      title={row.entityLabel}
                      subtitle={`${DELETION_ENTITY_LABELS_RU[row.entityType] ?? row.entityType} · ${formatWhen(row.createdAt)}`}
                    />
                  ),
                },
                {
                  id: 'comment',
                  header: 'Комментарий',
                  render: (row) => {
                    const parts: string[] = [];
                    if (row.reason) parts.push(row.reason);
                    if (row.reviewComment) parts.push(`Решение: ${row.reviewComment}`);
                    return parts.length > 0 ? parts.join(' · ') : '—';
                  },
                },
                {
                  id: 'status',
                  header: 'Статус',
                  render: (row) => (
                    <div className="data-table__cell-badges">
                      <StatusBadge status={row.status} />
                    </div>
                  ),
                },
              ]}
              renderActions={(row) =>
                canApprove && row.status === 'PENDING' ? (
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <Button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => void review(row.id, 'approve')}
                    >
                      {busyId === row.id ? '…' : 'Удалить'}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busyId === row.id}
                      onClick={() => void review(row.id, 'reject')}
                    >
                      Отклонить
                    </Button>
                  </div>
                ) : null
              }
            />
          </EntityListPanel>
        </Section>
      </PageContainer>
    </main>
  );
}
