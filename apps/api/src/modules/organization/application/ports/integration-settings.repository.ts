export const INTEGRATION_SETTINGS_REPOSITORY = Symbol('INTEGRATION_SETTINGS_REPOSITORY');

export type IntegrationSettingsRecord = {
  organizationId: string;
  geocodingProvider: string;
  yandexMapsApiKey: string | null;
  navigationProvider: string;
  mapDefaultLatitude: string | null;
  mapDefaultLongitude: string | null;
  updatedAt: Date;
};

export type UpsertIntegrationSettingsInput = {
  organizationId: string;
  geocodingProvider: string;
  yandexMapsApiKey?: string | null;
  navigationProvider: string;
  mapDefaultLatitude?: string | null;
  mapDefaultLongitude?: string | null;
};

export interface IntegrationSettingsRepository {
  findByOrganizationId(organizationId: string): Promise<IntegrationSettingsRecord | null>;
  upsert(input: UpsertIntegrationSettingsInput): Promise<IntegrationSettingsRecord>;
}

export const DEFAULT_INTEGRATION_SETTINGS: Omit<
  IntegrationSettingsRecord,
  'organizationId' | 'updatedAt'
> = {
  geocodingProvider: 'nominatim',
  yandexMapsApiKey: null,
  navigationProvider: 'yandex_maps',
  mapDefaultLatitude: '53.900601',
  mapDefaultLongitude: '27.558972',
};
