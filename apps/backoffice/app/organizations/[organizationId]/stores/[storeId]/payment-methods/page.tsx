'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';
import { Field } from '@/components/layout/field';
import { FancySelect } from '@/components/layout/fancy-select';
import { formatApiErrorMessage } from '@/lib/format-api-error';

type PaymentMethod = Awaited<
  ReturnType<ReturnType<typeof getApiClient>['listPaymentMethods']>
>[number];

const METHOD_TYPES = [
  { value: 'CASH', label: 'Наличные' },
  { value: 'BANK_CARD', label: 'Банковская карта' },
  { value: 'ONLINE', label: 'Онлайн' },
  { value: 'QR', label: 'QR' },
  { value: 'BANK_TRANSFER', label: 'Банковский перевод' },
  { value: 'GIFT_CERTIFICATE', label: 'Подарочный сертификат' },
  { value: 'OTHER', label: 'Другое' },
] as const;

export default function PaymentMethodsPage() {
  const params = useParams<{ organizationId: string; storeId: string }>();
  const auth = useAuth();
  const { organizationId, storeId } = params;
  const base = `/organizations/${organizationId}/stores/${storeId}`;

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

  async function onArchive(methodId: string) {
    await run(() => getApiClient().archivePaymentMethod(organizationId, storeId, methodId));
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
          breadcrumbs={[
            { label: 'Организации', href: '/organizations' },
            { label: 'Организация', href: `/organizations/${organizationId}` },
            { label: 'Магазин', href: base },
            { label: 'Способы оплаты' },
          ]}
          actions={
            <Button type="button" disabled={busy} onClick={() => void onEnsureDefaults()}>
              Создать стандартные
            </Button>
          }
        />

        <Section>
          {loading ? <LoadingState /> : null}
          {error ? <ErrorState message={error} /> : null}
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

        <Section>
          <Card title="Список">
            {!loading && methods.length === 0 ? (
              <EmptyState message="Методов пока нет. Нажмите «Создать стандартные»." />
            ) : null}
            <ul className="list-stack">
              {methods.map((method) => (
                <li key={method.id}>
                  <div className="meta-row">
                    <strong>
                      {method.name} ({method.code})
                    </strong>
                    <StatusBadge status={method.type} />
                    <StatusBadge status={method.isActive ? 'ACTIVE' : 'ARCHIVED'} />
                    {method.isActive ? (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => void onArchive(method.id)}
                      >
                        Архив
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      </PageContainer>
    </main>
  );
}
