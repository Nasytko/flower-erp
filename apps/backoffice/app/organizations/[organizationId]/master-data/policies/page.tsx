'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { getApiClient } from '@/lib/api-client';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';
import { Field } from '@/components/layout/field';
import { FancySelect } from '@/components/layout/fancy-select';
import { formatApiErrorMessage } from '@/lib/format-api-error';
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
  const organizationId = params.organizationId;
  const base = `/organizations/${organizationId}/master-data`;

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

  async function onArchive(policyId: string) {
    setError(null);
    try {
      await getApiClient().archivePolicy(organizationId, policyId);
      await load();
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось архивировать'));
    }
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Политики учёта"
          description="Правила учёта остатков: партии и срок годности. Сами остатки здесь не хранятся."
          breadcrumbs={[
            { label: 'Организации', href: '/organizations' },
            { label: 'Организация', href: `/organizations/${organizationId}` },
            { label: 'Справочники', href: base },
            { label: 'Политики' },
          ]}
        />
        <Section>
          <Card title="Список">
            {loading ? <LoadingState /> : null}
            {error ? <ErrorState message={error} /> : null}
            {!loading && items.length === 0 ? <EmptyState message="Политик пока нет." /> : null}
            <ul className="list-stack">
              {items.map((item) => (
                <li key={item.id}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      flexWrap: 'wrap',
                      padding: 12,
                      border: '1px solid var(--color-border)',
                      borderRadius: 10,
                      background: 'var(--color-surface)',
                    }}
                  >
                    <div>
                      <strong>{item.name}</strong>
                      <div className="meta-row" style={{ marginTop: 4 }}>
                        <StatusBadge status={typeLabel(item.itemType)} />
                        <StatusBadge status={trackingLabel(item.trackingMethod)} />
                        <StatusBadge status={item.status} />
                        <span style={{ fontSize: 'var(--text-xs)' }}>
                          {item.expirationTracking ? 'со сроком годности' : 'без срока годности'}
                        </span>
                      </div>
                    </div>
                    {item.status !== 'ARCHIVED' ? (
                      <Button variant="ghost" onClick={() => void onArchive(item.id)}>
                        Архив
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
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
