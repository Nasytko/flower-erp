# ADR-030: Manual route planning in v1

**Status:** Accepted  
**Date:** 2026-07-17  

## Decision

- `DeliveryRoutePlan` + `DeliveryRouteStop` support manual grouping and sequence for a service date / optional courier.
- Reorder via server command `ReorderRouteStops` with `expectedVersion` (UI may use up/down or drag as shell only).
- No automatic route optimization, travel-time matrix, or vendor route payload in core tables.

## Consequences

External navigator opens one stop (or multi-stop only if adapter supports without lock-in). Optimization deferred.
