'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { useAuth } from '@/components/auth-provider';
import { getApiClient } from '@/lib/api-client';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/states';
import { Field } from '@/components/layout/field';
import { formatApiErrorMessage } from '@/lib/format-api-error';
import { catalogBreadcrumbs, canOperateCatalog } from '@/lib/settings-nav';
import {
  type FieldErrors,
  firstFieldError,
  hasFieldErrors,
  requiredText,
} from '@/lib/form-validation';

type ShowcaseBouquet = {
  id: string;
  name: string;
  code: string;
  previewLines: Array<{ componentName: string; quantity: string }>;
  previewMoreCount: number;
};

export default function ShowcaseBouquetsPage() {
  const params = useParams<{ organizationId: string }>();
  const router = useRouter();
  const auth = useAuth();
  const organizationId = params.organizationId;
  const base = `/organizations/${organizationId}/master-data`;
  const canOperate = canOperateCatalog(auth.hasPermission);

  const [items, setItems] = useState<ShowcaseBouquet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await getApiClient().listShowcaseBouquets(organizationId);
      setItems(list);
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось загрузить букеты'));
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    const errors: FieldErrors = {
      name: requiredText(name, 'Укажите название букета'),
    };
    setFieldErrors(errors);
    if (hasFieldErrors(errors)) {
      setError(firstFieldError(errors));
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const created = await getApiClient().createItem(organizationId, {
        name,
        description: description || undefined,
        itemType: 'FLOWER',
        isSellable: true,
        isShowcase: true,
        isPurchasable: false,
      });
      router.push(`${base}/items/${created.id}`);
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось создать букет'));
      setCreating(false);
    }
  }

  function previewText(item: ShowcaseBouquet) {
    if (item.previewLines.length === 0) {
      return 'Состав не задан — откройте карточку и добавьте рецепт';
    }
    const lines = item.previewLines
      .map((line) => `${line.componentName} × ${line.quantity}`)
      .join(' · ');
    return item.previewMoreCount > 0 ? `${lines} · ещё ${item.previewMoreCount}` : lines;
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Букеты на витрине"
          description="Готовые рецепты, которые флорист выбирает при создании заказа в режиме «Букет с витрины»."
          breadcrumbs={catalogBreadcrumbs(organizationId, { label: 'Букеты на витрине' })}
        />

        <Section>
          <Card title="Список">
            {loading ? <LoadingState /> : null}
            {error ? <ErrorState message={error} /> : null}
            {!loading && items.length === 0 ? (
              <EmptyState
                message={
                  canOperate
                    ? 'Букетов на витрине пока нет. Создайте первый ниже и задайте состав.'
                    : 'Букетов на витрине пока нет.'
                }
              />
            ) : null}
            <ul className="list-stack">
              {items.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`${base}/items/${item.id}`}
                    style={{
                      display: 'block',
                      padding: 12,
                      border: '1px solid var(--color-border)',
                      borderRadius: 10,
                      background: 'var(--color-surface)',
                      textDecoration: 'none',
                      color: 'inherit',
                    }}
                  >
                    <strong>
                      {item.name} ({item.code})
                    </strong>
                    <p
                      style={{
                        margin: '6px 0 0',
                        fontSize: 'var(--text-sm)',
                        color: 'var(--color-muted)',
                      }}
                    >
                      {previewText(item)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </Section>

        {canOperate ? (
          <Section>
            <Card title="Добавить букет на витрину">
              <p className="field__hint" style={{ marginTop: 0 }}>
                После создания откроется карточка — там нужно указать состав (цветы и материалы).
              </p>
              <form onSubmit={onCreate} className="form-grid" noValidate>
                <Field label="Название" required error={fieldErrors.name}>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    minLength={2}
                    placeholder="Например, Букет «Нежность»"
                    aria-label="Название букета"
                  />
                </Field>
                <Field label="Описание" hint="Необязательно">
                  <Input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    aria-label="Описание букета"
                  />
                </Field>
                <Button type="submit" disabled={creating}>
                  {creating ? 'Создание…' : 'Создать и задать состав'}
                </Button>
              </form>
            </Card>
          </Section>
        ) : null}
      </PageContainer>
    </main>
  );
}
