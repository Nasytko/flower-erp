# ADR-013: Goods Receipt Partial Receiving

**Status:** Accepted  
**Date:** 2026-07-15  
**Relates to:** ADR-003, supply-flow

## Context

One Supply may arrive in multiple physical shipments. Users need partial receiving without overstating stock or mutating posted documents.

## Decision

- Multiple `GoodsReceipt` documents may exist per `Supply`.
- Cumulative received (sum of posted receipt `receivedQuantity` per `SupplyItem`) must not exceed `orderedQuantity` in v1 (no over-receipt override).
- After each successful post, Supply status is recalculated:
  - all lines fully covered by cumulative received → `RECEIVED`;
  - otherwise → `PARTIALLY_RECEIVED` (from `SUBMITTED_TO_SUPPLIER`).
- Defect qty stays on `GoodsReceiptItem` and does **not** create stock (only `acceptedQuantity` creates Batch + RECEIPT movement).
- Status vocabulary in code: `SUBMITTED_TO_SUPPLIER`, `ANNULLED` (aligns product language; docs use these going forward).
- Posted receipts are immutable; corrections use `ReverseGoodsReceipt`.

## Consequences

- Positive: matches warehouse practice; nested UI under Supply.
- Negative: status aggregation must be tested carefully across multi-receipt scenarios.
