import { Injectable } from '@nestjs/common';
import type {
  AddressSearchHit,
  GeocodeResult,
  GeocodingPort,
  StructuredAddress,
} from '../application/ports/geocoding.port';

/**
 * Manual geocoding adapter — does not call external providers.
 * Returns empty search / null geocode so callers can set USER_PIN coordinates.
 */
@Injectable()
export class ManualGeocodingAdapter implements GeocodingPort {
  async searchAddress(): Promise<AddressSearchHit[]> {
    return [];
  }

  async geocodeAddress(_address: StructuredAddress): Promise<GeocodeResult | null> {
    return null;
  }

  async reverseGeocode(
    latitude: string,
    longitude: string,
  ): Promise<GeocodeResult | null> {
    return {
      latitude,
      longitude,
      displayAddress: `${latitude}, ${longitude}`,
      provider: 'manual',
    };
  }
}

/** Deterministic mock for development/tests. */
@Injectable()
export class MockGeocodingAdapter implements GeocodingPort {
  async searchAddress(
    query: string,
    context?: { city?: string },
  ): Promise<AddressSearchHit[]> {
    const city = context?.city ?? 'Minsk';
    return [
      {
        displayAddress: `${query}, ${city}`,
        latitude: '53.9006010',
        longitude: '27.5589720',
        addressLine: query,
        city,
        postalCode: null,
      },
    ];
  }

  async geocodeAddress(address: StructuredAddress): Promise<GeocodeResult | null> {
    return {
      latitude: '53.9006010',
      longitude: '27.5589720',
      displayAddress: `${address.addressLine}, ${address.city}`,
      provider: 'mock',
    };
  }

  async reverseGeocode(
    latitude: string,
    longitude: string,
  ): Promise<GeocodeResult | null> {
    return {
      latitude,
      longitude,
      displayAddress: `Mock reverse ${latitude},${longitude}`,
      provider: 'mock',
    };
  }
}
