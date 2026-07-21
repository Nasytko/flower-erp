# ADR-004: Organization → Store → Warehouse

**Status:** Accepted  
**Date:** 2026-07-15

## Context

Equating Store with stock location works for a single counter but fails when a shop gains backroom storage, central warehouse, or multi-site ops. Full WMS locations are premature.

## Decision

- Hierarchy: **Organization → Store → Warehouse**
- **Location** not implemented in v1
- Creating a Store **always** creates one **primary Warehouse**
- Schema/API must allow **additional warehouses** per store later without redesign
- Warehouse-scoped stock operations include `warehouseId` (+ org/store ids per tenancy rules)

## Consequences

- **Positive:** Ready for central warehouse and multi-stock sites
- **Positive:** Default path stays simple for single-warehouse shops
- **Negative:** Slightly more ids to plumb than Store-only stock
- **Negative:** Transfer UX needed when second warehouse appears

## Alternatives considered

- Store-only stock — rejected as multi-store debt
- Immediate bin Location tree — deferred complexity
