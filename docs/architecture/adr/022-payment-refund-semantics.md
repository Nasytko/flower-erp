# ADR-022: Payment Refund Semantics

**Status:** Accepted  
**Date:** 2026-07-16  

## Decision

- Refund is a separate document linked to original COMPLETED Payment.
- Cumulative completed refunds ≤ original payment amount.
- Refunds move money only (CashOperation OUT) — no inventory reverse.
- Annul Payment forbidden if completed refunds exist.
- Idempotent complete/annul; no hard delete.

## Consequences

Inventory returns remain a future epic; refund is cash-only.
