import { Injectable } from '@nestjs/common';
import type { ApiEnv } from '@flower/config';
import type {
  AddressSearchHit,
  GeocodeResult,
  GeocodingPort,
  StructuredAddress,
} from '../application/ports/geocoding.port';

type NominatimAddress = {
  road?: string;
  pedestrian?: string;
  house_number?: string;
  city?: string;
  town?: string;
  village?: string;
  suburb?: string;
  postcode?: string;
};

type NominatimHit = {
  display_name: string;
  lat: string;
  lon: string;
  address?: NominatimAddress;
};

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const MIN_INTERVAL_MS = 1100;

function buildAddressLine(address?: NominatimAddress, fallback?: string): string {
  if (address) {
    const street = address.road ?? address.pedestrian ?? '';
    const number = address.house_number ?? '';
    if (street && number) return `${street}, ${number}`;
    if (street) return street;
    if (number) return number;
  }
  if (fallback) {
    const first = fallback.split(',')[0]?.trim();
    if (first) return first;
  }
  return fallback?.trim() ?? '';
}

function resolveCity(address?: NominatimAddress, fallback?: string): string {
  const city =
    address?.city ?? address?.town ?? address?.village ?? address?.suburb ?? '';
  if (city) return city;
  if (fallback) {
    const parts = fallback.split(',').map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2) return parts[parts.length - 2] ?? parts[parts.length - 1]!;
  }
  return '';
}

function mapHit(row: NominatimHit): AddressSearchHit {
  return {
    displayAddress: row.display_name,
    latitude: row.lat,
    longitude: row.lon,
    addressLine: buildAddressLine(row.address, row.display_name),
    city: resolveCity(row.address, row.display_name),
    postalCode: row.address?.postcode ?? null,
  };
}

/**
 * OpenStreetMap Nominatim — free geocoding without API keys.
 * Respects 1 req/sec policy (https://operations.osmfoundation.org/policies/nominatim/).
 */
@Injectable()
export class NominatimGeocodingAdapter implements GeocodingPort {
  private lastRequestAt = 0;

  constructor(private readonly env: ApiEnv) {}

  async searchAddress(
    query: string,
    context?: { city?: string; countryCode?: string },
  ): Promise<AddressSearchHit[]> {
    const trimmed = query.trim();
    if (trimmed.length < 2) return [];

    const city = context?.city?.trim();
    const searchQuery = city ? `${trimmed}, ${city}` : trimmed;
    const countryCode = context?.countryCode ?? this.env.GEOCODING_COUNTRY_CODE;

    await this.throttle();
    const url = new URL(`${NOMINATIM_BASE}/search`);
    url.searchParams.set('q', searchQuery);
    url.searchParams.set('format', 'json');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('limit', '8');
    url.searchParams.set('countrycodes', countryCode);

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': this.env.NOMINATIM_USER_AGENT,
        'Accept-Language': 'ru',
      },
    });
    if (!response.ok) return [];

    const rows = (await response.json()) as NominatimHit[];
    return rows.map(mapHit).filter((hit) => hit.addressLine.length > 0);
  }

  async geocodeAddress(address: StructuredAddress): Promise<GeocodeResult | null> {
    const hits = await this.searchAddress(`${address.addressLine}, ${address.city}`, {
      city: address.city,
      countryCode: address.countryCode ?? this.env.GEOCODING_COUNTRY_CODE,
    });
    const first = hits[0];
    if (!first) return null;
    return {
      latitude: first.latitude,
      longitude: first.longitude,
      displayAddress: first.displayAddress,
      provider: 'nominatim',
    };
  }

  async reverseGeocode(latitude: string, longitude: string): Promise<GeocodeResult | null> {
    await this.throttle();
    const url = new URL(`${NOMINATIM_BASE}/reverse`);
    url.searchParams.set('lat', latitude);
    url.searchParams.set('lon', longitude);
    url.searchParams.set('format', 'json');
    url.searchParams.set('addressdetails', '1');

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': this.env.NOMINATIM_USER_AGENT,
        'Accept-Language': 'ru',
      },
    });
    if (!response.ok) return null;

    const row = (await response.json()) as NominatimHit;
    return {
      latitude: row.lat,
      longitude: row.lon,
      displayAddress: row.display_name,
      provider: 'nominatim',
    };
  }

  private async throttle(): Promise<void> {
    const wait = this.lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    this.lastRequestAt = Date.now();
  }
}
