# ADR-017: Inventory Issue and Reservation Consume

**Status:** Accepted  
**Date:** 2026-07-16  
**Relates to:** ADR-012, ADR-014, ADR-015, ADR-016  

## Context

Reservations hold stock for orders. Completing a Sale must consume actual composition quantities, release excess reservations, and issue any shortfall from free available stock (FEFO/FIFO).

## Decision

### Movement types (Prisma)

Add `ISSUE` and `ISSUE_REVERSAL` to `InventoryMovementType`.

### Port

`InventoryIssuePort`:

- `issueForSale(command)` — idempotent by `(organizationId, scope, key)`
- `reverseIssue(command)` — compensating ISSUE_REVERSAL

Sales never selects batches; Inventory owns allocation.

### Algorithm `issueForSale`

For each requested item quantity:

1. Load ACTIVE reservations for provided composition item ids (order-based) or empty for direct.
2. Consume reservation qty first (ACTIVE→CONSUMED or partial consume via new reservation split / quantity reduce + CONSUME movement).
3. If still short vs requested: allocate free available (onHand−reserved) FEFO then FIFO; create ISSUE without prior reservation.
4. If reserved > requested for an item: RELEASE excess ACTIVE.
5. For each issued slice: ISSUE movement, ↓ batch.remainingQuantity, ↓ onHand, ↓ reserved (for consumed portion), recompute available.
6. Return allocations `{ batchId, itemId, quantity, unitCost, costAmount }` and total COGS.

### Partial reservation consume

Minimal extension: when consuming less than an ACTIVE reservation quantity, reduce reservation quantity (or split row) and append `ReservationMovement` CONSUME; full consume → status `CONSUMED`.

### Explicit non-goals

Write-off, transfer, stock count, POS offline.

## Consequences

Actual≠Planned composition is supported; no orphan ACTIVE reservations after successful sale issue.
