# ADR-033: Positive inventory adjustment cost policy

**Status:** Accepted  
**Date:** 2026-07-17  

## Decision

Positive count adjustments (`INVENTORY_ADJUSTMENT_IN`) use **last-known weighted average unit cost** per `(organizationId, warehouseId, itemId)` at posting time, derived from active batch remaining quantities and costs.

- Zero-cost inbound adjustments are forbidden.
- Manual director override is deferred.
- New batches created for positive adjustments carry the computed average cost snapshot.

## Consequences

Count posting must compute average cost before creating inbound batches and movements.
