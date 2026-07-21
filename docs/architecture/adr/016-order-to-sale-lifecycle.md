# ADR-016: Order-to-Sale Lifecycle

**Status:** Accepted  
**Date:** 2026-07-16  
**Relates to:** ADR-005, ADR-015  

## Context

Orders prepare floral work (composition + reservation). Sales must record commercial realization and trigger inventory issue. Order and Sale remain separate documents (ADR-005).

## Decision

### Sale types

- `ORDER_BASED` — created only from Order in `READY` with non-empty frozen ActualComposition; at most one non-annulled Sale per Order.
- `DIRECT` — store quick sale without Order; commercial lines + explicit inventory composition.

### Lifecycle

1. `CreateSaleFromOrder` / `CreateDirectSale` → `DRAFT` (no inventory write).
2. `CompleteSale` (idempotent) → Inventory ISSUE + consume/release reservations → Sale `COMPLETED` → if ORDER_BASED, Order `READY`→`COMPLETED` via `OrdersSalesPort`.
3. `AnnulSale` → ISSUE_REVERSAL → Sale `ANNULLED` → Order back to `READY` (no auto re-reserve). See ADR-018.

### Ports

- Sales → Orders: `OrdersSalesPort` only (no Prisma Order tables in Sales).
- Sales → Inventory: `InventoryIssuePort` only.
- Orders must not create Sale or ISSUE movements.

### Explicit non-goals

Payment, Delivery, Fiscalization, POS Agent, Shift cash drawer.

## Consequences

Clear Order→Sale handoff; stock issue only on CompleteSale; DRAFT is editable/commercial-only.
