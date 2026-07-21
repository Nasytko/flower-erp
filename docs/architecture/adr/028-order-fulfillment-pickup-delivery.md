# ADR-028: Order fulfillment PICKUP vs DELIVERY

**Status:** Accepted  
**Date:** 2026-07-17  

## Decision

- Reuse existing `Order.type` (`PICKUP` | `DELIVERY`) as the fulfillment type. Do not add a second boolean/enum.
- `PICKUP`: no active DeliveryJob.
- `DELIVERY`: exactly one active DeliveryJob; creating/updating requires address/window/method.
- Switching DELIVERY → PICKUP before courier handover cancels the active job via an explicit command (history retained).
- Switching PICKUP → DELIVERY creates a DeliveryJob with required fields.

## Consequences

Order Detail / Work Order show fulfillment + delivery summary from a delivery read model, not duplicated address columns on Order.
