'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { DocRef } from '@/components/layout/doc-ref';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';
import { Field } from '@/components/layout/field';
import { useToast } from '@/components/ui/toast';
import {
  type FieldErrors,
  firstFieldError,
  hasFieldErrors,
  requiredText,
} from '@/lib/form-validation';
import { formatApiErrorMessage } from '@/lib/format-api-error';
import { settingsBreadcrumbs, settingsHubHref } from '@/lib/settings-nav';

type Store = {
  id: string;
  name: string;
  code: string;
  status: string;
  address: string | null;
  city: string | null;
  timezone: string;
};

type Warehouse = {
  id: string;
  name: string;
  code: string;
  isDefault: boolean;
  type: string;
  status: string;
};

export default function StoreSettingsPage() {
  const params = useParams<{ organizationId: string; storeId: string }>();
  const auth = useAuth();
  const toast = useToast();
  const { organizationId, storeId } = params;

  const [store, setStore] = useState<Store | null>(null);
  const [warehouse, setWarehouse] = useState<Warehouse | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [timezone, setTimezone] = useState('Europe/Moscow');
  const [warehouseName, setWarehouseName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const client = getApiClient();
      const [storeData, warehouses] = await Promise.all([
        client.getStore(organizationId, storeId),
        client.listWarehouses(organizationId, storeId),
      ]);
      const defaultWh = warehouses.find((w) => w.isDefault) ?? warehouses[0] ?? null;
      setStore(storeData);
      setWarehouse(defaultWh);
      setName(storeData.name);
      setAddress(storeData.address ?? '');
      setCity(storeData.city ?? '');
      setTimezone(storeData.timezone);
      setWarehouseName(defaultWh?.name ?? '');
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось загрузить магазин'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, storeId]);

  async function onSave(event: FormEvent) {
    event.preventDefault();
    const errors: FieldErrors = {
      name: requiredText(name, 'Укажите название магазина'),
      timezone: requiredText(timezone, 'Укажите часовой пояс'),
    };
    if (warehouse) {
      errors.warehouseName = requiredText(warehouseName, 'Укажите название склада');
    }
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
      const client = getApiClient();
      const updated = await client.updateStore(organizationId, storeId, {
        name: name.trim(),
        address: address.trim() || null,
        city: city.trim() || null,
        timezone: timezone.trim(),
      });
      setStore(updated);

      if (warehouse) {
        const updatedWh = await client.updateWarehouse(
          organizationId,
          storeId,
          warehouse.id,
          { name: warehouseName.trim() },
        );
        setWarehouse(updatedWh);
      }

      toast.success('Настройки сохранены');
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
          refCode={store?.code}
          breadcrumbs={settingsBreadcrumbs(organizationId, { label: 'Магазин и склад' })}
          actions={store ? <StatusBadge status={store.status} /> : undefined}
        />

        {loading ? <LoadingState message="Загрузка…" /> : null}
        {error ? <ErrorState message={error} /> : null}

        {!loading && store ? (
          <Section>
            <Card title="Магазин и склад">
              <form onSubmit={onSave} className="stack-form admin-settings-form" noValidate>
                <div className="admin-settings-form__group">
                  <h3 className="admin-settings-form__heading">Магазин</h3>
                  <Field label="Название" required error={fieldErrors.name}>
                    <Input value={name} onChange={(e) => setName(e.target.value)} required />
                  </Field>
                  <div className="sale-custom-meta">
                    <Field label="Город">
                      <Input
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="Минск"
                      />
                    </Field>
                    <Field label="Часовой пояс" required error={fieldErrors.timezone}>
                      <Input
                        value={timezone}
                        onChange={(e) => setTimezone(e.target.value)}
                        placeholder="Europe/Minsk"
                        required
                      />
                    </Field>
                  </div>
                  <Field label="Адрес">
                    <Input
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="ул. Примерная, 1"
                    />
                  </Field>
                </div>

                {warehouse ? (
                  <div className="admin-settings-form__group">
                    <h3 className="admin-settings-form__heading">Склад</h3>
                    <Field label="Название склада" required error={fieldErrors.warehouseName}>
                      <Input
                        value={warehouseName}
                        onChange={(e) => setWarehouseName(e.target.value)}
                        required
                      />
                    </Field>
                    <div className="admin-settings-form__meta">
                      <DocRef>{warehouse.code}</DocRef>
                      <StatusBadge status={warehouse.status} />
                      {warehouse.isDefault ? (
                        <span className="user-card__pill">Основной</span>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <p className="field__hint">Склад не найден — он создаётся вместе с магазином.</p>
                )}

                <div className="meta-row">
                  <Button type="submit" disabled={saving}>
                    {saving ? 'Сохранение…' : 'Сохранить'}
                  </Button>
                  <Link href={settingsHubHref(organizationId)}>К настройкам</Link>
                </div>
              </form>
            </Card>
          </Section>
        ) : null}
      </PageContainer>
    </main>
  );
}
