export const ROUTING_PORT = Symbol('ROUTING_PORT');

export type RouteStopPoint = {
  latitude: string;
  longitude: string;
  label?: string;
};

export type BuiltRoute = {
  provider: string;
  polyline: string | null;
  distanceMeters: number | null;
  durationSeconds: number | null;
};

export interface RoutingPort {
  buildRoute(
    stops: RouteStopPoint[],
    start?: RouteStopPoint | null,
  ): Promise<BuiltRoute | null>;
  estimateTravelTime(
    from: RouteStopPoint,
    to: RouteStopPoint,
  ): Promise<{ durationSeconds: number | null; distanceMeters: number | null }>;
  generateExternalNavigationUrl(stops: RouteStopPoint[]): string | null;
}
