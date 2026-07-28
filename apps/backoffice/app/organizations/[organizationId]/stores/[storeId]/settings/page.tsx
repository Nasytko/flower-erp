'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { ErrorState, LoadingState } from '@/components/layout/states';
import { Field } from '@/components/layout/field';
import { useToast } from '@/components/ui/toast';
import {
  type FieldErrors,
  firstFieldError,
  hasFieldErrors,
  requiredText,
} from '@/lib/form-validation';
import { formatApiErrorMessage } from '@/lib/format-api-error';

type Store = {
  id: string;
  name: string;
  code: string;
  status: string;
  address: string | null;
  city: string | null;
  timezone: string;
};

export default function StoreSettingsPage() {
  const params = useParams<{ organizationId: string; storeId: string }>();
  const auth = useAuth();
  const toast = useToast();
  const { organizationId, storeId } = params;
  const base = `/organizations/${organizationId}/stores/${storeId}`;

  const [store, setStore] = useState<Store | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [timezone, setTimezone] = useState('Europe/Moscow');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getApiClient()
      .getStore(organizationId, storeId)
      .then((data) => {
        if (cancelled) return;
        setStore(data);
        setName(data.name);
        setAddress(data.address ?? '');
        setCity(data.city ?? '');
        setTimezone(data.timezone);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(formatApiErrorMessage(err, 'Не удалось загрузить магазин'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, storeId]);

  async function onSave(event: FormEvent) {
    event.preventDefault();
    const errors: FieldErrors = {
      name: requiredText(name, 'Укажите название магазина'),
      timezone: requiredText(timezone, 'Укажите часовой пояс'),
    };
    setFieldErrors(errors);
    if (hasFieldErrors(errors)) {
      const message = firstFieldError(errors);
      setError(message);
      if (message) toast.error(message);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const updated = await getApiClient().updateStore(organizationId, storeId, {
        name: name.trim(),
        address: address.trim() || null,
        city: city.trim() || null,
        timezone: timezone.trim(),
      });
      setStore(updated);
      toast.success('Настройки магазина сохранены');
    } catch (err) {
      const message = formatApiErrorMessage(err, 'Не удалось сохранить');
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  if (!auth.hasPermission('stores:create')) {
    return <p className="page-state">Доступ запрещён</p>;
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Настройки магазина"
          description={store ? `${store.name} (${store.code})` : 'Редактирование профиля магазина'}
          breadcrumbs={[
            { label: 'Организации', href: '/organizations' },
            { label: 'Организация', href: `/organizations/${organizationId}` },
            { label: store?.name ?? 'Магазин', href: base },
            { label: 'Настройки' },
          ]}
        />

        {loading ? <LoadingState message="Загрузка…" /> : null}
        {error ? <ErrorState message={error} /> : null}

        {!loading && store ? (
          <Section>
            <Card title="Профиль магазина">
              <form onSubmit={onSave} className="stack-form" noValidate>
                <Field label="Название" required error={fieldErrors.name}>
                  <Input value={name} onChange={(e) => setName(e.target.value)} required />
                </Field>
                <Field label="Город">
                  <Input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Москва"
                  />
                </Field>
                <Field label="Адрес">
                  <Input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="ул. Примерная, 1"
                  />
                </Field>
                <Field label="Часовой пояс" required error={fieldErrors.timezone}>
                  <Input
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    placeholder="Europe/Moscow"
                    required
                  />
                </Field>
                <p className="field__hint">
                  Код магазина ({store.code}) меняется отдельно и здесь не редактируется.
                </p>
                <div className="meta-row">
                  <Button type="submit" disabled={saving}>
                    {saving ? 'Сохранение…' : 'Сохранить'}
                  </Button>
                  <Link href={base}>Назад к магазину</Link>
                </div>
              </form>
            </Card>
          </Section>
        ) : null}
      </PageContainer>
    </main>
  );
}
