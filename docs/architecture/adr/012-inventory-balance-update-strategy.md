# ADR-012: Inventory Balance Update Strategy

**Status:** Accepted  
**Date:** 2026-07-15  
**Relates to:** ADR-003

## Context

Balances must stay consistent with immutable movements under concurrent posting, without Redis and without rewriting movement history.

## Decision

- `InventoryBalance` is a **live projection** maintained **only inside Inventory posting** (same UnitOfWork / Prisma transaction as movements).
- Balance grain: `(organizationId, storeId, warehouseId, itemId)`.
- Update algorithm inside transaction:
  1. `SELECT … FOR UPDATE` on the balance row (or insert if missing).
  2. Apply delta to `onHandQuantity`.
  3. Recompute `availableQuantity = onHandQuantity - reservedQuantity`.
  4. Reject if `onHandQuantity` would go negative in this slice.
- No public API may mutate balances.
- Rebuild-from-movements is allowed as a future ops tool, not the runtime write path for v1 posting.

## Consequences

- Positive: simple reads; atomic with movements under Postgres locking.
- Negative: bugs in posting can desync projection — reconciliation job may be needed later.
- Concurrent posts on the same item/warehouse serialize on the balance row lock.
