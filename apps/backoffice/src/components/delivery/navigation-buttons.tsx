'use client';

import { Button } from '@flower/ui';

type NavigationButtonsProps = {
  mapsUrl?: string | null;
  navigatorUrl?: string | null;
  latitude?: string | null;
  longitude?: string | null;
};

function buildNavigatorWebFallback(latitude: string, longitude: string): string {
  return `https://yandex.ru/navi/?rtext=~${encodeURIComponent(latitude)},${encodeURIComponent(longitude)}`;
}

export function NavigationButtons({
  mapsUrl,
  navigatorUrl,
  latitude,
  longitude,
}: NavigationButtonsProps) {
  const navUrl =
    navigatorUrl ??
    (latitude && longitude
      ? `yandexnavi://build_route_on_map?lat_to=${encodeURIComponent(latitude)}&lon_to=${encodeURIComponent(longitude)}`
      : null);
  const navWebFallback =
    latitude && longitude ? buildNavigatorWebFallback(latitude, longitude) : null;

  if (!mapsUrl && !navUrl) return null;

  return (
    <div className="delivery-action-row">
      {mapsUrl ? (
        <a href={mapsUrl} target="_blank" rel="noreferrer">
          <Button type="button" variant="secondary">
            На карте
          </Button>
        </a>
      ) : null}
      {navUrl ? (
        <a href={navUrl} target="_blank" rel="noreferrer">
          <Button type="button" variant="secondary">
            Навигатор
          </Button>
        </a>
      ) : null}
      {navWebFallback ? (
        <a href={navWebFallback} target="_blank" rel="noreferrer">
          <Button type="button" variant="ghost">
            Навигатор (web)
          </Button>
        </a>
      ) : null}
    </div>
  );
}
