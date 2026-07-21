# ADR-029: Provider-neutral geocoding, map, and routing ports

**Status:** Accepted  
**Date:** 2026-07-17  

## Decision

- Domain depends on `GeocodingPort` and `RoutingPort` interfaces only.
- v1 adapters: `ManualGeocodingAdapter` / `MockGeocodingAdapter`; `ExternalNavigationLinkAdapter` (single-point external maps URL).
- No Google Maps (or other paid provider) wired as default. Frontend uses a provider-neutral map contract with list/placeholder mode until a licensed provider is chosen.
- API keys only via environment; never stored in DB.
- Delivery creation is not blocked forever by geocoding failure — user can set MANUAL coordinates.

## Consequences

Map UI can switch providers without changing Delivery domain tables or use cases.
