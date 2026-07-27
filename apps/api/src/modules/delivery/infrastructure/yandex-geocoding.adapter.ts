import type {
  AddressSearchHit,
  GeocodeResult,
  GeocodingPort,
  StructuredAddress,
} from '../application/ports/geocoding.port';

type YandexGeoMember = {
  GeoObject?: {
    metaDataProperty?: {
      GeocoderMetaData?: {
        text?: string;
        Address?: {
          Components?: Array<{ kind?: string; name?: string }>;
        };
      };
    };
    Point?: { pos?: string };
  };
};

type YandexGeocodeResponse = {
  response?: {
    GeoObjectCollection?: {
      featureMember?: YandexGeoMember[];
    };
  };
};

function component(
  components: Array<{ kind?: string; name?: string }> | undefined,
  kind: string,
): string {
  return components?.find((part) => part.kind === kind)?.name?.trim() ?? '';
}

function mapGeoObject(row: YandexGeoMember): AddressSearchHit | null {
  const geo = row.GeoObject;
  const pos = geo?.Point?.pos?.trim();
  if (!geo || !pos) return null;
  const [lon, lat] = pos.split(/\s+/);
  if (!lat || !lon) return null;

  const meta = geo.metaDataProperty?.GeocoderMetaData;
  const components = meta?.Address?.Components ?? [];
  const street = component(components, 'street') || component(components, 'district');
  const house = component(components, 'house');
  const city =
    component(components, 'locality') ||
    component(components, 'province') ||
    component(components, 'area');
  const addressLine =
    street && house ? `${street}, ${house}` : street || house || meta?.text?.split(',')[0]?.trim() || '';
  if (!addressLine) return null;

  return {
    displayAddress: meta?.text ?? `${addressLine}, ${city}`,
    latitude: lat,
    longitude: lon,
    addressLine,
    city: city || 'Минск',
    postalCode: component(components, 'postal_code') || null,
  };
}

/**
 * Yandex Geocoder + Geosuggest via Geocoder search API.
 * @see https://yandex.ru/dev/geocode/doc/ru/
 */
export class YandexGeocodingAdapter implements GeocodingPort {
  constructor(private readonly apiKey: string) {}

  async searchAddress(
    query: string,
    context?: { city?: string; countryCode?: string },
  ): Promise<AddressSearchHit[]> {
    const trimmed = query.trim();
    if (trimmed.length < 2) return [];
    const city = context?.city?.trim();
    const geocode = city ? `${trimmed}, ${city}` : trimmed;
    const url = new URL('https://geocode-maps.yandex.ru/v1/');
    url.searchParams.set('apikey', this.apiKey);
    url.searchParams.set('geocode', geocode);
    url.searchParams.set('format', 'json');
    url.searchParams.set('results', '8');
    url.searchParams.set('lang', 'ru_RU');

    const response = await fetch(url.toString());
    if (!response.ok) return [];

    const payload = (await response.json()) as YandexGeocodeResponse;
    const members = payload.response?.GeoObjectCollection?.featureMember ?? [];
    const hits: AddressSearchHit[] = [];
    for (const member of members) {
      const hit = mapGeoObject(member);
      if (hit) hits.push(hit);
    }
    return hits;
  }

  async geocodeAddress(address: StructuredAddress): Promise<GeocodeResult | null> {
    const hits = await this.searchAddress(`${address.addressLine}, ${address.city}`, {
      city: address.city,
    });
    const first = hits[0];
    if (!first) return null;
    return {
      latitude: first.latitude,
      longitude: first.longitude,
      displayAddress: first.displayAddress,
      provider: 'yandex',
    };
  }

  async reverseGeocode(latitude: string, longitude: string): Promise<GeocodeResult | null> {
    const url = new URL('https://geocode-maps.yandex.ru/v1/');
    url.searchParams.set('apikey', this.apiKey);
    url.searchParams.set('geocode', `${longitude},${latitude}`);
    url.searchParams.set('format', 'json');
    url.searchParams.set('results', '1');
    url.searchParams.set('lang', 'ru_RU');

    const response = await fetch(url.toString());
    if (!response.ok) return null;

    const payload = (await response.json()) as YandexGeocodeResponse;
    const hit = mapGeoObject(payload.response?.GeoObjectCollection?.featureMember?.[0] ?? {});
    if (!hit) return null;
    return {
      latitude: hit.latitude,
      longitude: hit.longitude,
      displayAddress: hit.displayAddress,
      provider: 'yandex',
    };
  }
}
