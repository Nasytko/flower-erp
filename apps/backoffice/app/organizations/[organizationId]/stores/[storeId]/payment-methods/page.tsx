'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { DataTable, DataTableCellPrimary } from '@/components/layout/data-table';
import { EntityListPanel } from '@/components/layout/entity-list-panel';
import { StatusBadge } from '@/components/layout/status-badge';
import { Field } from '@/components/layout/field';
import { FancySelect } from '@/components/layout/fancy-select';
import { DeletionRequestButton } from '@/components/admin/deletion-request-button';
import { formatApiErrorMessage } from '@/lib/format-api-error';
import { storeSettingsBreadcrumbs } from '@/lib/settings-nav';

type PaymentMethod = Awaited<
  ReturnType<ReturnType<typeof getApiClient>['listPaymentMethods']>
>[number];

const METHOD_TYPES = [
  { value: 'CASH', label: 'Наличные' },
  { value: 'BANK_CARD', label: 'Банковская карта' },
  { value: 'ONLINE', label: 'Онлайн' },
  { value: 'QR', label: 'QR' },
  { value: 'BANK_TRANSFER', label: 'Банковский перевод' },
  { value: 'OTHER', label: 'Другое' },
] as const;

export default function PaymentMethodsPage() {
  const params = useParams<{ organizationId: string; storeId: string }>();
  const auth = useAuth();
  const { organizationId, storeId } = params;

  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<string>('CASH');

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const list = await getApiClient().listPaymentMethods(organizationId, storeId);
      setMethods(list);
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось загрузить'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!auth.hasPermission('payments:manage-methods')) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, storeId, auth]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Действие не выполнено'));
    } finally {
      setBusy(false);
    }
  }

  async function onEnsureDefaults() {
    await run(() => getApiClient().ensureDefaultPaymentMethods(organizationId, storeId));
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    await run(async () => {
      await getApiClient().createPaymentMethod(organizationId, storeId, {
        name: name.trim(),
        type,
      });
      setName('');
      setType('CASH');
    });
  }

  if (!auth.hasPermission('payments:manage-methods')) {
    return <p className="page-state">Доступ запрещён</p>;
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Способы оплаты"
          description="Справочник методов оплаты магазина."
          breadcrumbs={storeSettingsBreadcrumbs(organizationId, storeId, { label: 'Способы оплаты' })}
          actions={
            <Button type="button" disabled={busy} onClick={() => void onEnsureDefaults()}>
              Создать стандартные
            </Button>
          }
        />

        <Section>
          <EntityListPanel
            title="Способы оплаты"
            count={methods.length}
            loading={loading}
            error={error}
            isEmpty={!loading && !error && methods.length === 0}
            emptyMessage="Методов пока нет. Нажмите «Создать стандартные»."
          >
            <DataTable
              rows={methods}
              getRowKey={(method) => method.id}
              columns={[
                {
                  id: 'name',
                  header: 'Метод',
                  render: (method) => (
                    <DataTableCellPrimary title={method.name} subtitle={method.code} />
                  ),
                },
                {
                  id: 'type',
                  header: 'Тип',
                  render: (method) => (
                    <div className="data-table__cell-badges">
                      <StatusBadge status={method.type} />
                    </div>
                  ),
                },
                {
                  id: 'status',
                  header: 'Статус',
                  render: (method) => (
                    <div className="data-table__cell-badges">
                      <StatusBadge status={method.isActive ? 'ACTIVE' : 'ARCHIVED'} />
                    </div>
                  ),
                },
              ]}
              renderActions={(method) =>
                method.isActive ? (
                  <DeletionRequestButton
                    organizationId={organizationId}
                    entityType="PAYMENT_METHOD"
                    entityId={method.id}
                    entityLabel={`${method.name} (${method.code})`}
                    storeId={storeId}
                    onRequested={() => void load()}
                  />
                ) : null
              }
            />
          </EntityListPanel>
        </Section>

        <Section>
          <Card title="Новый метод">
            <form onSubmit={onCreate} className="form-grid">
              <Field label="Название" required hint="Как способ оплаты виден кассиру">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  aria-label="Название метода оплаты"
                />
              </Field>
              <Field label="Тип" required>
                <FancySelect
                  value={type}
                  onChange={setType}
                  searchable={false}
                  options={METHOD_TYPES.map((item) => ({
                    value: item.value,
                    label: item.label,
                  }))}
                  aria-label="Тип метода оплаты"
                />
              </Field>
              <Button type="submit" disabled={busy || !name.trim()}>
                Создать
              </Button>
            </form>
          </Card>
        </Section>
      </PageContainer>
    </main>
  );
}
