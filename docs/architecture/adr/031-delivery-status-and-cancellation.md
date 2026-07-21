# ADR-031: Delivery status machine and cancellation

**Status:** Accepted  
**Date:** 2026-07-17  

## Decision

Statuses: `DRAFT → PLANNED → READY_FOR_DISPATCH → ASSIGNED → IN_TRANSIT → DELIVERED`, plus `PROBLEM` and `CANCELLED`.  
Transitions only through use cases.  
`PROBLEM` resolves via explicit use case back to an allowed status or `CANCELLED`/`DELIVERED`.  
Cancel and deliver are idempotent with Idempotency-Key.  
Hard delete forbidden. Optimistic concurrency via `DeliveryJob.version` / `expectedVersion`.

## Consequences

Board urgency is computed (not stored). MarkDelivered does not auto-complete Order/Sale/Payment.
