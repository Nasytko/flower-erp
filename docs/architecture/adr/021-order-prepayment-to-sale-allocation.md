# ADR-021: Order Prepayment to Sale Allocation

**Status:** Accepted  
**Date:** 2026-07-16  
**Relates to:** ADR-005, ADR-016, ADR-020  

## Context

Order prepayments must transfer to Sale without duplicating money.

## Decision

1. Completing a Payment does not copy money when Sale is created.
2. Explicit use case `AllocateOrderPrepaymentsToSale` reassigns payment coverage.
3. Model: immutable `PaymentAllocation` rows + `PaymentAllocationTransfer` history.
4. Transfer: close Order allocations (amount moved) and create Sale allocations totaling the same Payment amount slice; Payment.amount unchanged.
5. One transaction; AuditLog + timelines.

## Consequences

No double-counting; audit trail of reallocation; overpayment forbidden in v1.
