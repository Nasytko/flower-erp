'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { useAuth } from '@/components/auth-provider';
import { getApiClient } from '@/lib/api-client';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { ErrorState } from '@/components/layout/states';
import { EntityListPanel } from '@/components/layout/entity-list-panel';
import { DataTable, DataTableCellPrimary } from '@/components/layout/data-table';
import { StatusBadge } from '@/components/layout/status-badge';
import { Field } from '@/components/layout/field';
import { FancySelect } from '@/components/layout/fancy-select';
import { DeletionRequestButton } from '@/components/admin/deletion-request-button';
import { formatApiErrorMessage } from '@/lib/format-api-error';
import { catalogAdminBreadcrumbs, CATALOG_ADMIN_PERMISSION } from '@/lib/settings-nav';
import {
  type FieldErrors,
  firstFieldError,
  hasFieldErrors,
  requiredText,
} from '@/lib/form-validation';

type Policy = {
  id: string;
  name: string;
  itemType: string;
  trackingMethod: string;
  expirationTracking: boolean;
  status: string;
};

function typeLabel(type: string) {
  return type === 'MATERIAL' ? 'Материал' : 'Цветок';
}

function trackingLabel(method: string) {
  return method === 'LOT' ? 'Партии' : 'Без партий';
}

export default function PoliciesPage() {
  const params = useParams<{ organizationId: string }>();
  const auth = useAuth();
  const organizationId = params.organizationId;

  const [items, setItems] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [itemType, setItemType] = useState<'FLOWER' | 'MATERIAL'>('FLOWER');
  const [creating, setCreating] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await getApiClient().listPolicies(organizationId, 1, 100);
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
      itemType: requiredText(itemType, 'Выберите тип товара'),
    };
    setFieldErrors(errors);
    if (hasFieldErrors(errors)) {
      setError(firstFieldError(errors));
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const isFlower = itemType === 'FLOWER';
      await getApiClient().createPolicy(organizationId, {
        name,
        itemType,
        trackingMethod: isFlower ? 'LOT' : 'NONE',
        expirationTracking: isFlower,
        defaultShelfLifeDays: isFlower ? 7 : undefined,
        reservationAllowed: false,
        allowFractionalQuantity: !isFlower,
      });
      setName('');
      await load();
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось создать'));
    } finally {
      setCreating(false);
    }
  }

  if (!auth.hasPermission(CATALOG_ADMIN_PERMISSION)) {
    return (
      <main>
        <PageContainer>
          <ErrorState message="Раздел доступен только директору." />
        </PageContainer>
      </main>
    );
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Учёт по партиям"
          description="Шаблон срока годности при приёмке. Фактический срок и остаток — в партии; продажи и списания списывают с самой старой партии."
          breadcrumbs={catalogAdminBreadcrumbs(organizationId, { label: 'Учёт по партиям' })}
        />
        <Section>
          <EntityListPanel
            title="Политики учёта"
            count={items.length}
            loading={loading}
            error={error}
            isEmpty={!loading && !error && items.length === 0}
            emptyMessage="Политик пока нет."
          >
            <DataTable
              rows={items}
              getRowKey={(item) => item.id}
              columns={[
                {
                  id: 'name',
                  header: 'Название',
                  render: (item) => <DataTableCellPrimary title={item.name} />,
                },
                {
                  id: 'type',
                  header: 'Тип',
                  render: (item) => (
                    <div className="data-table__cell-badges">
                      <StatusBadge status={typeLabel(item.itemType)} />
                      <StatusBadge status={trackingLabel(item.trackingMethod)} />
                    </div>
                  ),
                },
                {
                  id: 'expiry',
                  header: 'Срок годности',
                  render: (item) => (item.expirationTracking ? 'Да' : 'Нет'),
                },
                {
                  id: 'status',
                  header: 'Статус',
                  render: (item) => <StatusBadge status={item.status} />,
                },
              ]}
              renderActions={(item) =>
                item.status === 'ACTIVE' ? (
                  <DeletionRequestButton
                    organizationId={organizationId}
                    entityType="INVENTORY_POLICY"
                    entityId={item.id}
                    entityLabel={item.name}
                    onRequested={() => void load()}
                  />
                ) : null
              }
            />
          </EntityListPanel>
        </Section>
        <Section>
          <Card title="Создать политику">
            <form onSubmit={onCreate} className="form-grid" noValidate>
              <Field
                label="Название"
                required
                error={fieldErrors.name}
                hint="Например: «Цветы по умолчанию» или «Материалы дробные»"
              >
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={2}
                  aria-label="Название политики"
                />
              </Field>
              <Field
                label="Для типа товара"
                required
                error={fieldErrors.itemType}
                hint="Цветок — партии и срок годности; материал — без партий"
              >
                <FancySelect
                  value={itemType}
                  onChange={(value) => setItemType(value as 'FLOWER' | 'MATERIAL')}
                  searchable={false}
                  options={[
                    { value: 'FLOWER', label: 'Цветок (партии + срок годности)' },
                    { value: 'MATERIAL', label: 'Материал (без партий)' },
                  ]}
                  aria-label="Тип позиции политики"
                />
              </Field>
              <Button type="submit" disabled={creating}>
                {creating ? 'Создание…' : 'Создать'}
              </Button>
            </form>
          </Card>
        </Section>
      </PageContainer>
    </main>
  );
}
