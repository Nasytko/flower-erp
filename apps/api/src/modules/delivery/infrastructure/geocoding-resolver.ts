import { Inject, Injectable } from '@nestjs/common';
import type { ApiEnv } from '@flower/config';
import { API_ENV } from '../../../infrastructure/infrastructure.module';
import {
  DEFAULT_INTEGRATION_SETTINGS,
  INTEGRATION_SETTINGS_REPOSITORY,
  type IntegrationSettingsRecord,
  type IntegrationSettingsRepository,
} from '../../organization/application/ports/integration-settings.repository';
import type { GeocodingPort } from '../application/ports/geocoding.port';
import { ManualGeocodingAdapter } from './manual-geocoding.adapter';
import { NominatimGeocodingAdapter } from './nominatim-geocoding.adapter';
import { YandexGeocodingAdapter } from './yandex-geocoding.adapter';

@Injectable()
export class GeocodingResolver {
  private readonly manual = new ManualGeocodingAdapter();

  constructor(
    @Inject(INTEGRATION_SETTINGS_REPOSITORY)
    private readonly settings: IntegrationSettingsRepository,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  async forOrganization(organizationId: string): Promise<GeocodingPort> {
    const orgSettings = await this.settings.findByOrganizationId(organizationId);
    return this.resolve(orgSettings);
  }

  resolve(orgSettings: IntegrationSettingsRecord | null): GeocodingPort {
    const provider = orgSettings?.geocodingProvider ?? this.env.GEOCODING_PROVIDER;
    const yandexKey =
      orgSettings?.yandexMapsApiKey?.trim() || this.env.YANDEX_MAPS_API_KEY?.trim() || '';

    if (provider === 'yandex' && yandexKey) {
      return new YandexGeocodingAdapter(yandexKey);
    }
    if (provider === 'manual') {
      return this.manual;
    }
    if (provider === 'nominatim' || this.env.GEOCODING_PROVIDER === 'nominatim') {
      return new NominatimGeocodingAdapter(this.env);
    }
    return this.manual;
  }
}

export function resolveIntegrationSettings(
  orgSettings: IntegrationSettingsRecord | null,
): IntegrationSettingsRecord {
  if (!orgSettings) {
    return {
      organizationId: '',
      ...DEFAULT_INTEGRATION_SETTINGS,
      updatedAt: new Date(0),
    };
  }
  return orgSettings;
}
