'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { ApiClientError } from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';
import { Field } from '@/components/layout/field';
import { FancySelect } from '@/components/layout/fancy-select';
import {
  type FieldErrors,
  firstFieldError,
  hasFieldErrors,
  requiredText,
} from '@/lib/form-validation';

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
        client.listSuppliers(organizationId, { pageSize: 100, status: 'ACTIVE' }),
      ]);
      setItems(list);
      setSuppliers(supplierList.items);
      if (supplierList.items[0]) setSupplierId(supplierList.items[0].id);
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
            <Card title="Новая приёмка">
              <form onSubmit={onCreate} className="form-grid" noValidate>
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
                  {creating ? 'Создание…' : 'Создать и заполнить'}
                </Button>
              </form>
            </Card>
          </Section>
        ) : null}

        <Section>
          <Card title="Список">
            {loading ? <LoadingState /> : null}
            {error ? <ErrorState message={error} /> : null}
            {!loading && items.length === 0 ? (
              <EmptyState message="Приёмок пока нет. Создайте первую — добавьте товары и проведите на склад." />
            ) : null}
            <ul className="list-stack">
              {items.map((item) => (
                <li key={item.id}>
                  <Link href={`${base}/supplies/${item.id}`}>
                    <div className="meta-row">
                      <div>
                        <strong>{item.number}</strong>
                        {item.supplier?.name ? (
                          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)' }}>
                            {item.supplier.name}
                            {item.supplierDocumentNumber
                              ? ` · накладная ${item.supplierDocumentNumber}`
                              : null}
                            {formatDateLabel(item.receivedDate)
                              ? ` · приход ${formatDateLabel(item.receivedDate)}`
                              : null}
                          </div>
                        ) : null}
                      </div>
                      <StatusBadge status={item.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      </PageContainer>
    </main>
  );
}
