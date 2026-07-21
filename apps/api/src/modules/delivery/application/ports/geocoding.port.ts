export const GEOCODING_PORT = Symbol('GEOCODING_PORT');

export type StructuredAddress = {
  addressLine: string;
  city: string;
  postalCode?: string | null;
  countryCode?: string | null;
};

export type GeocodeResult = {
  latitude: string;
  longitude: string;
  displayAddress: string;
  provider: string;
};

export type AddressSearchHit = {
  displayAddress: string;
  latitude: string;
  longitude: string;
  addressLine: string;
  city: string;
  postalCode: string | null;
};

export interface GeocodingPort {
  searchAddress(
    query: string,
    context?: { city?: string; countryCode?: string },
  ): Promise<AddressSearchHit[]>;
  geocodeAddress(address: StructuredAddress): Promise<GeocodeResult | null>;
  reverseGeocode(latitude: string, longitude: string): Promise<GeocodeResult | null>;
}
