'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { useAuth } from '@/components/auth-provider';
import { getApiClient } from '@/lib/api-client';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { Field } from '@/components/layout/field';
import { DataTable, DataTableCellPrimary } from '@/components/layout/data-table';
import { EntityListFilters, EntityListPanel } from '@/components/layout/entity-list-panel';
import { StatusBadge } from '@/components/layout/status-badge';
import { DeletionRequestButton } from '@/components/admin/deletion-request-button';
import { formatApiErrorMessage } from '@/lib/format-api-error';
import { catalogBreadcrumbs, canOperateCatalog } from '@/lib/settings-nav';
import {
  type FieldErrors,
  firstFieldError,
  hasFieldErrors,
  requiredText,
} from '@/lib/form-validation';

type Supplier = {
  id: string;
  name: string;
  code: string;
  status: string;
  country: string | null;
  phone: string | null;
  email: string | null;
  contactPerson: string | null;
};

export default function SuppliersPage() {
  const params = useParams<{ organizationId: string }>();
  const auth = useAuth();
  const organizationId = params.organizationId;
  const base = `/organizations/${organizationId}/master-data`;
  const canOperate = canOperateCatalog(auth.hasPermission);

  const [items, setItems] = useState<Supplier[]>([]);
  const [nameFilter, setNameFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [comment, setComment] = useState('');
  const [creating, setCreating] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await getApiClient().listSuppliers(organizationId, {
        page: 1,
        pageSize: 50,
        name: nameFilter || undefined,
      });
      setItems(res.items);
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось загрузить'));
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
    const errors: FieldErrors = {
      name: requiredText(name, 'Укажите название'),
    };
    setFieldErrors(errors);
    if (hasFieldErrors(errors)) {
      setError(firstFieldError(errors));
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await getApiClient().createSupplier(organizationId, {
        name,
        country: country.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        contactPerson: contactPerson.trim() || undefined,
        comment: comment.trim() || undefined,
      });
      setName('');
      setCountry('');
      setPhone('');
      setEmail('');
      setContactPerson('');
      setComment('');
      await load();
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось создать'));
    } finally {
      setCreating(false);
    }
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Поставщики"
          description="Справочник поставщиков для закупок и поставок."
          breadcrumbs={catalogBreadcrumbs(organizationId, { label: 'Поставщики' })}
        />
        <Section>
          <EntityListPanel
            title="Поставщики"
            count={items.length}
            loading={loading}
            error={error}
            isEmpty={!loading && !error && items.length === 0}
            emptyMessage="Поставщиков пока нет."
            toolbar={
              <EntityListFilters onSubmit={() => void load()}>
                <Field label="Название">
                  <Input
                    value={nameFilter}
                    onChange={(e) => setNameFilter(e.target.value)}
                    placeholder="Поиск по названию…"
                    aria-label="Фильтр поставщиков по названию"
                  />
                </Field>
                <Button type="submit" variant="secondary">
                  Найти
                </Button>
              </EntityListFilters>
            }
          >
            <DataTable
              rows={items}
              getRowKey={(item) => item.id}
              getRowHref={(item) => `${base}/suppliers/${item.id}`}
              columns={[
                {
                  id: 'name',
                  header: 'Поставщик',
                  render: (item) => (
                    <DataTableCellPrimary title={item.name} subtitle={item.code} />
                  ),
                },
                {
                  id: 'contact',
                  header: 'Контакт',
                  render: (item) => (
                    <DataTableCellPrimary
                      title={item.contactPerson ?? '—'}
                      subtitle={[item.phone, item.email].filter(Boolean).join(' · ') || undefined}
                    />
                  ),
                },
                {
                  id: 'country',
                  header: 'Страна',
                  render: (item) => item.country ?? '—',
                },
                {
                  id: 'status',
                  header: 'Статус',
                  render: (item) => (
                    <div className="data-table__cell-badges">
                      <StatusBadge status={item.status} />
                    </div>
                  ),
                },
              ]}
              renderActions={(item) =>
                item.status === 'ACTIVE' ? (
                  <DeletionRequestButton
                    organizationId={organizationId}
                    entityType="SUPPLIER"
                    entityId={item.id}
                    entityLabel={`${item.name} (${item.code})`}
                    onRequested={() => void load()}
                  />
                ) : null
              }
            />
          </EntityListPanel>
        </Section>
        {canOperate ? (
        <Section>
          <Card title="Создать поставщика">
            <form onSubmit={onCreate} className="form-grid" noValidate>
              <Field
                label="Название"
                required
                error={fieldErrors.name}
                hint="Юридическое или торговое имя поставщика"
              >
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={2}
                  aria-label="Название поставщика"
                />
              </Field>
              <Field label="Страна" hint="Необязательно">
                <Input value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Страна" />
              </Field>
              <Field label="Контактное лицо" hint="Необязательно">
                <Input
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  aria-label="Контактное лицо"
                />
              </Field>
              <Field label="Телефон" hint="Необязательно">
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} aria-label="Телефон" />
              </Field>
              <Field label="Email" hint="Необязательно">
                <Input value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
              </Field>
              <Field label="Комментарий" hint="Необязательно">
                <Input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  aria-label="Комментарий"
                />
              </Field>
              <Button type="submit" disabled={creating}>
                {creating ? 'Создание…' : 'Создать'}
              </Button>
            </form>
          </Card>
        </Section>
        ) : null}
      </PageContainer>
    </main>
  );
}
