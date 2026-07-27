export type NavigationProvider = 'yandex_maps' | 'yandex_navigator' | 'google_maps' | 'osm';

export type NavigationLinks = {
  mapsUrl: string | null;
  navigatorUrl: string | null;
};

export function buildMapsUrl(
  provider: NavigationProvider,
  latitude: string,
  longitude: string,
  label?: string | null,
): string {
  const lat = encodeURIComponent(latitude);
  const lon = encodeURIComponent(longitude);
  switch (provider) {
    case 'google_maps':
      return `https://maps.google.com/maps?q=${lat},${lon}`;
    case 'osm':
      return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`;
    case 'yandex_navigator':
    case 'yandex_maps':
    default:
      if (label?.trim()) {
        return `https://yandex.ru/maps/?text=${encodeURIComponent(label.trim())}&z=17`;
      }
      return `https://yandex.ru/maps/?pt=${lon},${lat}&z=17&l=map`;
  }
}

export function buildNavigatorUrl(latitude: string, longitude: string): string {
  const lat = encodeURIComponent(latitude);
  const lon = encodeURIComponent(longitude);
  return `yandexnavi://build_route_on_map?lat_to=${lat}&lon_to=${lon}`;
}

export function buildNavigatorWebFallback(latitude: string, longitude: string): string {
  const lat = encodeURIComponent(latitude);
  const lon = encodeURIComponent(longitude);
  return `https://yandex.ru/navi/?rtext=~${lat},${lon}`;
}

export function buildNavigationLinks(input: {
  provider: NavigationProvider;
  latitude: string;
  longitude: string;
  label?: string | null;
}): NavigationLinks {
  return {
    mapsUrl: buildMapsUrl(input.provider, input.latitude, input.longitude, input.label),
    navigatorUrl: buildNavigatorUrl(input.latitude, input.longitude),
  };
}

export function buildAddressMapsUrl(
  provider: NavigationProvider,
  address: string,
): string | null {
  const text = address.trim();
  if (!text) return null;
  if (provider === 'google_maps') {
    return `https://maps.google.com/maps?q=${encodeURIComponent(text)}`;
  }
  if (provider === 'osm') {
    return `https://www.openstreetmap.org/search?query=${encodeURIComponent(text)}`;
  }
  return `https://yandex.ru/maps/?text=${encodeURIComponent(text)}`;
}
