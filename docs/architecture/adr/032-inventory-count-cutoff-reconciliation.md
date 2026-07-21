# ADR-032: Inventory count cutoff and reconciliation

**Status:** Accepted  
**Date:** 2026-07-17  

## Context

During inventory count, sales, write-offs, and transfers continue. A naive end-of-count balance read would be wrong.

## Decision

Use **snapshot + movement reconciliation** (not store freeze):

1. On `StartInventoryCount`, capture `cutoffAt` and per-line `systemQuantityAtCutoff` for scoped items/batches.
2. While counting, movements after cutoff are allowed.
3. On `PostInventoryCount`, for each line compute:
   `expectedAtPost = systemQuantityAtCutoff + netMovementsAfterCutoff`
   `difference = countedQuantity - expectedAtPost`
4. Post `INVENTORY_ADJUSTMENT_IN/OUT` for non-zero differences.

## Consequences

Count posting is more complex but shop operations are not blocked. Reconciliation logic lives in inventory domain + posting adapter.
