# ADR-015: Customer Order Composition Engine

**Status:** Accepted  
**Date:** 2026-07-16  
**Relates to:** ADR-005, ADR-014, ADR-012  
**Supersedes (status/reservation semantics only):** ADR-014 sections on all-or-nothing confirm and status set

## Context

Epic 07 introduces floral composition (planned + actual), thin Customer under orders, florist assignment concurrency, append-only OrderTimeline, and partial stock reservation. ADR-014’s all-or-nothing reserve and snapshot-only client are insufficient for florist production workflow.

## Decision

### Ownership

- `orders` owns: `Customer`, `Order` (CustomerOrder), `OrderComposition` / `OrderCompositionItem`, `ActualComposition` / `ActualCompositionItem`, `OrderAssignment`, `OrderTimelineEvent`, `OrderComment`.
- Thin Customer is **not** a CRM bounded context (ADR-005 remains: no loyalty/multi-channel CRM). Phone unique per organization; archive instead of delete; Order stores name/phone **snapshots**.
- Inventory still owns reservations; Orders call only `InventoryReservationPort.reserveComposition` / `releaseComposition` (opaque composition-item ids).

### Statuses (binding for Epic 07+)

`DRAFT` → `CONFIRMED` → `PARTIALLY_RESERVED` | `RESERVED` → `IN_PREPARATION` → `READY` → `COMPLETED`  
`CANCELLED` from any non-`COMPLETED`.

| Status | Meaning |
|--------|---------|
| DRAFT | Editable planned composition |
| CONFIRMED | Accepted; reservation not yet successful (zero reserved) |
| PARTIALLY_RESERVED | Some composition lines reserved; deficit remains |
| RESERVED | All planned lines fully reserved |
| IN_PREPARATION | Active florist assignment; actual composition mutable |
| READY | Actual composition immutable; no stock issue |
| COMPLETED | Closed toward Sale (Sale out of scope) |
| CANCELLED | Terminal; ACTIVE reservations released |

### Reservation semantics

- Confirm/reserve may **persist partial ACTIVE reservations**.
- Result outcome: `FULL` | `PARTIAL` | `NONE`.
- FEFO then FIFO; never negative available; no archive items; warehouse must belong to order store.
- No stock issue on READY/COMPLETE.

### Assignment

- One active `OrderAssignment` per order; start preparation requires assignment; optimistic concurrency via unique active row / version check.

### Timeline vs Audit

- `OrderTimelineEvent` — business narrative for florists (append-only).
- `AuditLog` — security/compliance trail (separate).

### Explicit non-goals

Sale, Payment, Delivery, Finance, files/S3, Notifications, AI, Telegram, Website.

## Consequences

- Positive: production-ready florist workflow; partial reserve visibility; Customer reuse without CRM.
- Negative: ADR-014 all-or-nothing rule replaced; migrate existing `CONFIRMED` deficit orders conceptually to `PARTIALLY_RESERVED` when any ACTIVE reservation exists.
- Domain `order-flow.md` updated to this ADR.
