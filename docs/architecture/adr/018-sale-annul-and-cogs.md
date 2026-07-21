# ADR-018: Sale Annul and COGS Policy

**Status:** Accepted  
**Date:** 2026-07-16  
**Relates to:** ADR-016, ADR-017  

## Context

Completed sales may need reversal before payments exist. COGS must come from real batch unit costs of issued allocations.

## Decision

### Annul

- Only `COMPLETED` → `ANNULLED` (no hard delete; no second annul).
- Requires `sales:annul`, reason, Idempotency-Key.
- Calls `InventoryIssuePort.reverseIssue` → ISSUE_REVERSAL; restore onHand/batch remaining.
- Does **not** restore original reservations.
- ORDER_BASED: Order `COMPLETED`→`READY` via OrdersSalesPort; timeline `SALE_ANNULLED`.
- Extensible guard port for future Payments (“sale has dependent payments”) — stub returns ok in this epic.

### COGS

- `costAmount` = sum(`issuedQuantity × batch.unitCost`) from issue result.
- `grossProfitAmount` = `netAmount - costAmount`.
- `marginPercent` = `netAmount > 0 ? grossProfitAmount / netAmount × 100 : null`.
- Monetary math: Decimal only (no JS float).
- Currency v1: `BYN`.
- Redact cost/margin without `sales:view-cost` / `sales:view-margin`.

### Discount

- NONE | PERCENT | FIXED; reason enum; threshold override via `SALES_DISCOUNT_OVERRIDE_PERCENT` env (default 20) requiring `sales:discount-override`.

## Consequences

Annul restores stock without re-reservation; margin visibility is permission-gated on API presenters.
