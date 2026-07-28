'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { getApiClient } from '@/lib/api-client';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';
import { Field } from '@/components/layout/field';
import { formatApiErrorMessage } from '@/lib/format-api-error';

function itemTypeLabel(type: string) {
  return type === 'MATERIAL' ? 'Материал' : 'Цветок';
}

function formatWhen(value?: string) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('ru-RU');
  } catch {
    return value;
  }
}

export default function ItemDetailPage() {
  const params = useParams<{ organizationId: string; itemId: string }>();
  const { organizationId, itemId } = params;
  const base = `/organizations/${organizationId}/master-data`;

  const [item, setItem] = useState<{
    id: string;
    name: string;
    code: string;
    itemType: string;
    status: string;
    categoryId: string;
    unitId: string;
    inventoryPolicyId: string;
    description: string | null;
    isSellable?: boolean;
    isPurchasable?: boolean;
    minimumStockQuantity?: string | null;
    createdAt?: string;
    createdByDisplayName?: string | null;
  } | null>(null);
  const [categoryName, setCategoryName] = useState<string | null>(null);
  const [policyName, setPolicyName] = useState<string | null>(null);
  const [minimumStock, setMinimumStock] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const client = getApiClient();
    Promise.all([
      client.getItem(organizationId, itemId),
      client.listCategories(organizationId, 1, 100),
      client.listPolicies(organizationId, 1, 100),
    ])
      .then(([data, cats, policies]) => {
        if (cancelled) return;
        setItem(data);
        setMinimumStock(data.minimumStockQuantity ?? '');
        setCategoryName(cats.items.find((c) => c.id === data.categoryId)?.name ?? null);
        setPolicyName(policies.items.find((p) => p.id === data.inventoryPolicyId)?.name ?? null);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(formatApiErrorMessage(err, 'Не удалось загрузить'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, itemId]);

  async function onSaveThreshold(event: FormEvent) {
    event.preventDefault();
    if (!item || item.itemType !== 'FLOWER') return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await getApiClient().updateItem(organizationId, itemId, {
        minimumStockQuantity: minimumStock.trim() ? minimumStock.trim() : null,
      });
      setItem((current) =>
        current
          ? { ...current, minimumStockQuantity: updated.minimumStockQuantity ?? null }
          : current,
      );
      setMinimumStock(updated.minimumStockQuantity ?? '');
      setMessage('Порог сохранён');
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось сохранить порог'));
    } finally {
      setSaving(false);
    }
  }

  async function onArchive() {
    setError(null);
    try {
      const updated = await getApiClient().archiveItem(organizationId, itemId);
      setItem((current) => (current ? { ...current, status: updated.status } : current));
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось архивировать'));
    }
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title={item?.name ?? 'Товар'}
          description={item ? `Код ${item.code}` : 'Загрузка…'}
          breadcrumbs={[
            { label: 'Организации', href: '/organizations' },
            { label: 'Организация', href: `/organizations/${organizationId}` },
            { label: 'Справочники', href: base },
            { label: 'Товары', href: `${base}/items` },
            { label: item?.name ?? 'Товар' },
          ]}
          actions={
            item && item.status !== 'ARCHIVED' ? (
              <Button variant="ghost" onClick={() => void onArchive()}>
                Архив
              </Button>
            ) : undefined
          }
        />
        {loading ? <LoadingState /> : null}
        {error ? <ErrorState message={error} /> : null}
        {message ? <p className="page-state">{message}</p> : null}
        {item ? (
          <>
            <Section>
              <Card title="Карточка товара">
                <div className="meta-row">
                  <StatusBadge status={itemTypeLabel(item.itemType)} />
                  <StatusBadge status={item.status} />
                  {item.isSellable ? <span className="sale-type-pill">Готовый букет</span> : null}
                  {item.isPurchasable === false ? (
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>
                      Не закупается
                    </span>
                  ) : null}
                </div>
                <dl
                  style={{
                    marginTop: 16,
                    display: 'grid',
                    gap: 10,
                    fontSize: 'var(--text-sm)',
                  }}
                >
                  <div>
                    <dt style={{ color: 'var(--color-muted)' }}>Категория</dt>
                    <dd style={{ margin: 0 }}>{categoryName ?? item.categoryId}</dd>
                  </div>
                  <div>
                    <dt style={{ color: 'var(--color-muted)' }}>Политика учёта</dt>
                    <dd style={{ margin: 0 }}>{policyName ?? item.inventoryPolicyId}</dd>
                  </div>
                  <div>
                    <dt style={{ color: 'var(--color-muted)' }}>Кто добавил</dt>
                    <dd style={{ margin: 0 }}>{item.createdByDisplayName ?? 'неизвестно'}</dd>
                  </div>
                  <div>
                    <dt style={{ color: 'var(--color-muted)' }}>Когда добавлен</dt>
                    <dd style={{ margin: 0 }}>{formatWhen(item.createdAt)}</dd>
                  </div>
                </dl>
                {item.description ? <p style={{ marginTop: 16 }}>{item.description}</p> : null}
              </Card>
            </Section>

            {item.itemType === 'FLOWER' && item.status !== 'ARCHIVED' ? (
              <Section>
                <Card title="Порог остатка">
                  <p style={{ marginTop: 0, color: 'var(--color-muted)', fontSize: 'var(--text-sm)' }}>
                    Когда доступный остаток на складе магазина опускается до этого числа или ниже,
                    позиция попадает в KPI «Ниже порога» на главной.
                  </p>
                  <form onSubmit={(event) => void onSaveThreshold(event)}>
                    <Field label="Минимальный остаток">
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        value={minimumStock}
                        onChange={(event) => setMinimumStock(event.target.value)}
                        placeholder="Не задан"
                      />
                    </Field>
                    <div style={{ marginTop: 12 }}>
                      <Button type="submit" disabled={saving}>
                        {saving ? 'Сохранение…' : 'Сохранить'}
                      </Button>
                    </div>
                  </form>
                </Card>
              </Section>
            ) : null}
          </>
        ) : null}
      </PageContainer>
    </main>
  );
}
