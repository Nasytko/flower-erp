# ADR-014: Order Status Model and Stock Reservation

**Status:** Accepted  
**Date:** 2026-07-15  
**Relates to:** ADR-003, ADR-005, ADR-012

## Context

`order-flow.md` listed an illustrative status set including delivery-oriented states. Epic 6 introduces an operational florist workflow with **reserve-on-confirm** and deficit visibility, without Sale/Payment/Delivery modules yet.

## Decision

### Order statuses (v1 operational)

`DRAFT` → `CONFIRMED` | `RESERVED` → `IN_PREPARATION` → `READY` → `COMPLETED`  
Cancel terminal: `CANCELLED` from non-terminal states except `COMPLETED`.

| Status | Meaning |
|--------|---------|
| DRAFT | Editable composition |
| CONFIRMED | Accepted; stock **not** fully reserved; deficit shown |
| RESERVED | All lines fully reserved (FIFO/FEFO on batches) |
| IN_PREPARATION | Florist working |
| READY | Ready for pickup/handoff |
| COMPLETED | Closed toward Sale (Sale itself is out of this epic) |
| CANCELLED | Terminal; active reservations released |

### Reservation ownership

- Inventory owns `Reservation` and `ReservationMovement`.
- Orders call `InventoryReservationPort` only (never Prisma inventory tables).
- Reservation references `orderItemId` as source document item id (typed `ORDER_ITEM`); no Order↔Inventory cyclic application imports.
- `availableQuantity = onHandQuantity - reservedQuantity` (ADR-012).
- Reserve allocates specific `ACTIVE` batches: FEFO (`expiresAt` ascending, nulls last) then FIFO (`receivedAt` ascending).
- Confirm attempts full reservation atomically; on shortfall → status `CONFIRMED`, no orphan reservations for that attempt (all-or-nothing).
- Partial existing ACTIVE reservations may be released and re-attempted via `ReserveOrder`.

### Explicit non-goals in this epic

Sale, Payment, Delivery, issue-on-sale, POS.

## Consequences

- Positive: clear florist queue; deficit without blocking acceptance.
- Negative: domain doc status names diverge from earlier illustrative list — this ADR is the binding set for implementation.
- Domain `order-flow.md` is updated to match.
