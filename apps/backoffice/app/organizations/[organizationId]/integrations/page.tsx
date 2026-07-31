'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import type { IntegrationSettingsDto } from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { Field } from '@/components/layout/field';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { ErrorState, LoadingState } from '@/components/layout/states';
import { useToast } from '@/components/ui/toast';
import { formatApiErrorMessage } from '@/lib/format-api-error';
import { settingsBreadcrumbs } from '@/lib/settings-nav';

export default function IntegrationsSettingsPage() {
  const params = useParams<{ organizationId: string }>();
  const auth = useAuth();
  const toast = useToast();
  const { organizationId } = params;

  const [settings, setSettings] = useState<IntegrationSettingsDto | null>(null);
  const [geocodingProvider, setGeocodingProvider] = useState('yandex');
  const [navigationProvider, setNavigationProvider] = useState('yandex_maps');
  const [apiKey, setApiKey] = useState('');
  const [mapLat, setMapLat] = useState('53.900601');
  const [mapLon, setMapLon] = useState('27.558972');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canRead = auth.hasPermission('organization:manage');
  const canManage = auth.hasPermission('organization:manage');

  useEffect(() => {
    if (!canRead) return;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getApiClient().getIntegrationSettings(organizationId);
        setSettings(data);
        setGeocodingProvider(data.geocodingProvider);
        setNavigationProvider(data.navigationProvider);
        setApiKey('');
        setMapLat(data.mapDefaultLatitude ?? '53.900601');
        setMapLon(data.mapDefaultLongitude ?? '27.558972');
      } catch (err) {
        setError(formatApiErrorMessage(err, 'Не удалось загрузить настройки'));
      } finally {
        setLoading(false);
      }
    })();
  }, [canRead, organizationId]);

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!canManage) return;
    setSaving(true);
    setError(null);
    try {
      const body: {
        geocodingProvider: string;
        navigationProvider: string;
        mapDefaultLatitude?: string | null;
        mapDefaultLongitude?: string | null;
        yandexMapsApiKey?: string | null;
      } = {
        geocodingProvider,
        navigationProvider,
        mapDefaultLatitude: mapLat.trim() || null,
        mapDefaultLongitude: mapLon.trim() || null,
      };
      if (apiKey.trim()) {
        body.yandexMapsApiKey = apiKey.trim();
      } else if (!settings?.yandexMapsApiKeyConfigured) {
        body.yandexMapsApiKey = null;
      }
      const saved = await getApiClient().updateIntegrationSettings(organizationId, body);
      setSettings(saved);
      toast.success('Настройки карт сохранены');
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось сохранить'));
    } finally {
      setSaving(false);
    }
  }

  if (!canRead) {
    return (
      <main>
        <PageContainer>
          <ErrorState message="Доступ запрещён" />
        </PageContainer>
      </main>
    );
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Карты и навигация"
          description="Яндекс.Карты для подсказок адресов, карты доставок и перехода в навигатор."
          breadcrumbs={settingsBreadcrumbs(organizationId, { label: 'Карты и навигация' })}
        />

        {loading ? <LoadingState /> : null}
        {error ? <ErrorState message={error} /> : null}

        {!loading ? (
          <Section>
            <Card title="Интеграция">
              <form className="stack-form" onSubmit={onSave}>
                <Field label="Подсказки адресов">
                  <select
                    className="field-control"
                    value={geocodingProvider}
                    onChange={(e) => setGeocodingProvider(e.target.value)}
                    disabled={!canManage}
                  >
                    <option value="yandex">Яндекс (рекомендуется для BY)</option>
                    <option value="nominatim">OpenStreetMap</option>
                    <option value="manual">Без подсказок</option>
                  </select>
                </Field>

                <Field
                  label="API-ключ Яндекс.Карт"
                  hint={
                    settings?.yandexMapsApiKeyConfigured
                      ? 'Ключ сохранён. Оставьте поле пустым, чтобы не менять, или введите новый.'
                      : 'Получите в кабинете developer.tech.yandex.ru.'
                  }
                >
                  <Input
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    disabled={!canManage}
                    autoComplete="off"
                  />
                </Field>

                <Field label="Открывать «На карте»">
                  <select
                    className="field-control"
                    value={navigationProvider}
                    onChange={(e) => setNavigationProvider(e.target.value)}
                    disabled={!canManage}
                  >
                    <option value="yandex_maps">Яндекс.Карты</option>
                    <option value="yandex_navigator">Яндекс.Карты (то же приложение)</option>
                    <option value="google_maps">Google Maps</option>
                    <option value="osm">OpenStreetMap</option>
                  </select>
                </Field>

                <div className="sale-custom-meta">
                  <Field label="Центр карты — широта">
                    <Input
                      value={mapLat}
                      onChange={(e) => setMapLat(e.target.value)}
                      inputMode="decimal"
                      disabled={!canManage}
                    />
                  </Field>
                  <Field label="Центр карты — долгота">
                    <Input
                      value={mapLon}
                      onChange={(e) => setMapLon(e.target.value)}
                      inputMode="decimal"
                      disabled={!canManage}
                    />
                  </Field>
                </div>

                {settings?.mapsEnabled ? (
                  <p className="field__hint">Карта в доставках активна.</p>
                ) : (
                  <p className="field__hint">
                    Укажите ключ и выберите «Яндекс», чтобы включить карту и подсказки адресов.
                  </p>
                )}

                {canManage ? (
                  <Button type="submit" disabled={saving}>
                    {saving ? 'Сохранение…' : 'Сохранить'}
                  </Button>
                ) : (
                  <p className="field__hint">Изменение доступно с правом organization:manage.</p>
                )}
              </form>
            </Card>

            <Card title="Где используется">
              <ul className="list-stack">
                <li>Подсказки адреса при создании заказа и в доставке</li>
                <li>Карта доставок — в разделе «Доставка» выбранного магазина</li>
                <li>Кнопки «На карте» и «Навигатор» у точки доставки</li>
              </ul>
            </Card>
          </Section>
        ) : null}
      </PageContainer>
    </main>
  );
}
