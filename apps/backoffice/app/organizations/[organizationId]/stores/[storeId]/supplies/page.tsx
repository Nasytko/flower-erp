'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { ApiClientError } from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { DataTable, DataTableCellPrimary } from '@/components/layout/data-table';
import { EntityListPanel } from '@/components/layout/entity-list-panel';
import { StatusBadge } from '@/components/layout/status-badge';
import { Field } from '@/components/layout/field';
import { FancySelect } from '@/components/layout/fancy-select';
import {
  SupplyWorkflowSteps,
  supplyWorkflowNextHint,
} from '@/components/supply/supply-workflow-steps';
import {
  type FieldErrors,
  firstFieldError,
  hasFieldErrors,
  requiredText,
} from '@/lib/form-validation';
import { listAllSuppliers } from '@/lib/catalog-items';

type SupplyRow = {
  id: string;
  number: string;
  status: string;
  supplierId: string;
  warehouseId: string;
  receivedDate?: string | null;
  paymentDueDate?: string | null;
  supplierDocumentNumber?: string | null;
  supplier?: { name: string; code: string };
};

function todayDateInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDateLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString('ru-RU');
  } catch {
    return iso.slice(0, 10);
  }
}

function supplyDatesSubtitle(item: SupplyRow): string | undefined {
  const parts: string[] = [];
  const received = formatDateLabel(item.receivedDate);
  const due = formatDateLabel(item.paymentDueDate);
  if (received) parts.push(`Приход ${received}`);
  if (due) parts.push(`Оплата до ${due}`);
  if (item.supplierDocumentNumber) parts.push(`Накладная ${item.supplierDocumentNumber}`);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

export default function SuppliesPage() {
  const params = useParams<{ organizationId: string; storeId: string }>();
  const router = useRouter();
  const { organizationId, storeId } = params;
  const base = `/organizations/${organizationId}/stores/${storeId}`;

  const [items, setItems] = useState<SupplyRow[]>([]);
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string; code: string }>>(
    [],
  );
  const [supplierId, setSupplierId] = useState('');
  const [receivedDate, setReceivedDate] = useState(todayDateInput);
  const [paymentDueDate, setPaymentDueDate] = useState('');
  const [supplierDocumentNumber, setSupplierDocumentNumber] = useState('');
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const client = getApiClient();
      const [list, supplierList] = await Promise.all([
        client.listSupplies(organizationId, storeId),
        listAllSuppliers(client, organizationId),
      ]);
      setItems(list);
      setSuppliers(supplierList);
      if (supplierList[0]) setSupplierId(supplierList[0].id);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось загрузить');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, storeId]);

  useEffect(() => {
    if (!loading && items.length === 0) {
      setShowCreate(true);
    }
  }, [loading, items.length]);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    const errors: FieldErrors = {
      supplierId: requiredText(supplierId, 'Выберите поставщика'),
    };
    setFieldErrors(errors);
    if (hasFieldErrors(errors)) {
      setError(firstFieldError(errors));
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const created = await getApiClient().createSupply(organizationId, storeId, {
        supplierId,
        receivedDate,
        paymentDueDate: paymentDueDate.trim() || undefined,
        supplierDocumentNumber: supplierDocumentNumber.trim() || undefined,
        comment: comment.trim() || undefined,
      });
      router.push(`${base}/supplies/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось создать');
      setCreating(false);
    }
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Приёмки"
          description="Фиксируйте приход товара на склад: позиции, количество и себестоимость — затем проведите на остатки."
          breadcrumbs={[
            { label: 'Организации', href: '/organizations' },
            { label: 'Организация', href: `/organizations/${organizationId}` },
            { label: 'Магазин', href: base },
            { label: 'Приёмки' },
          ]}
          actions={
            <Button type="button" onClick={() => setShowCreate((v) => !v)}>
              {showCreate ? 'Скрыть' : 'Новая приёмка'}
            </Button>
          }
        />

        {showCreate ? (
          <Section>
            <Card title="Новая приёмка · шаг 1">
              <SupplyWorkflowSteps current={1} />
              <p className="field__hint" style={{ marginTop: 0 }}>
                {supplyWorkflowNextHint(1)}
              </p>
              <form onSubmit={onCreate} className="form-grid" noValidate style={{ marginTop: 16 }}>
                <Field label="Поставщик" required error={fieldErrors.supplierId}>
                  <FancySelect
                    value={supplierId}
                    onChange={setSupplierId}
                    options={suppliers.map((s) => ({
                      value: s.id,
                      label: s.name,
                      hint: s.code,
                    }))}
                    required
                    aria-label="Поставщик"
                  />
                </Field>
                <Field label="Дата прихода" hint="По умолчанию — сегодня">
                  <Input
                    type="date"
                    value={receivedDate}
                    onChange={(e) => setReceivedDate(e.target.value)}
                    aria-label="Дата прихода"
                  />
                </Field>
                <Field label="Оплатить до" hint="Необязательно">
                  <Input
                    type="date"
                    value={paymentDueDate}
                    onChange={(e) => setPaymentDueDate(e.target.value)}
                    aria-label="Срок оплаты"
                  />
                </Field>
                <Field label="Номер накладной" hint="Номер документа поставщика">
                  <Input
                    value={supplierDocumentNumber}
                    onChange={(e) => setSupplierDocumentNumber(e.target.value)}
                    placeholder="Например, 124/А"
                    aria-label="Номер накладной"
                  />
                </Field>
                <Field label="Комментарий">
                  <Input
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    aria-label="Комментарий"
                  />
                </Field>
                <Button type="submit" disabled={creating || !supplierId}>
                  {creating ? 'Создание…' : 'Далее: добавить товары →'}
                </Button>
              </form>
            </Card>
          </Section>
        ) : null}

        <Section>
          <EntityListPanel
            title="Приёмки"
            count={items.length}
            loading={loading}
            error={error}
            isEmpty={!loading && !error && items.length === 0}
            emptyMessage="Приёмок пока нет. Создайте первую — добавьте товары и проведите на склад."
          >
            <DataTable
              rows={items}
              getRowKey={(item) => item.id}
              getRowHref={(item) => `${base}/supplies/${item.id}`}
              columns={[
                {
                  id: 'number',
                  header: 'Номер',
                  render: (item) => <DataTableCellPrimary title={item.number} />,
                },
                {
                  id: 'supplier',
                  header: 'Поставщик',
                  render: (item) =>
                    item.supplier ? (
                      <DataTableCellPrimary title={item.supplier.name} subtitle={item.supplier.code} />
                    ) : (
                      '—'
                    ),
                },
                {
                  id: 'dates',
                  header: 'Даты',
                  render: (item) => supplyDatesSubtitle(item) ?? '—',
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
            />
          </EntityListPanel>
        </Section>
      </PageContainer>
    </main>
  );
}
