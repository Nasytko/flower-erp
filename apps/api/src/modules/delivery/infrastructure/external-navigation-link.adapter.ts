import { Injectable } from '@nestjs/common';
import type { RouteStopPoint, RoutingPort } from '../application/ports/routing.port';

/**
 * Provider-neutral external navigation deep links (no API key).
 * Default: OpenStreetMap marker URL. Replaceable via ROUTING_PORT binding.
 */
@Injectable()
export class ExternalNavigationLinkAdapter implements RoutingPort {
  async buildRoute(): Promise<null> {
    return null;
  }

  async estimateTravelTime(): Promise<{
    durationSeconds: number | null;
    distanceMeters: number | null;
  }> {
    return { durationSeconds: null, distanceMeters: null };
  }

  generateExternalNavigationUrl(stops: RouteStopPoint[]): string | null {
    const first = stops[0];
    if (!first) return null;
    const lat = first.latitude;
    const lon = first.longitude;
    // OpenStreetMap marker — documented as replaceable (also works as maps.google.com/maps?q=lat,lng)
    return `https://www.openstreetmap.org/?mlat=${encodeURIComponent(lat)}&mlon=${encodeURIComponent(lon)}#map=17/${encodeURIComponent(lat)}/${encodeURIComponent(lon)}`;
  }
}

export function buildOpenStreetMapNavigationUrl(lat: string, lon: string): string {
  return `https://www.openstreetmap.org/?mlat=${encodeURIComponent(lat)}&mlon=${encodeURIComponent(lon)}#map=17/${encodeURIComponent(lat)}/${encodeURIComponent(lon)}`;
}

export function buildGenericMapsDeepLink(lat: string, lon: string): string {
  return `https://maps.google.com/maps?q=${encodeURIComponent(lat)},${encodeURIComponent(lon)}`;
}
