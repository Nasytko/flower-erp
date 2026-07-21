# Domain Flow: Inventory

**Status:** Accepted  
**Module:** `inventory`

## Responsibility

Provide a **single stock ledger** for all item types: batches/lots, immutable movements, derived balances, policy-based allocation, reservations, and all physical stock document posting.

## Boundaries

- Does not own Supply/Sale/Order headers.
- Does not perform management P&L.
- Does not expose APIs to set balance fields directly.
- Flowers and materials are **not** separate modules.

## Main entities

| Entity | Role |
|--------|------|
| `Batch` | Lot/batch dimension: qty, cost, expiry, links to source receipt / transfer / count adjustment |
| `InventoryMovement` | Immutable ledger line |
| `InventoryBalance` | Projection: `onHand`, `reserved`, `available = onHand - reserved` |
| `InventoryReservation` | ACTIVE / RELEASED / CONSUMED hold linked to `orderItemId` + batch + warehouse |
| `ReservationMovement` | System-only RESERVE / RELEASE / CONSUME lines |
| `WriteOffDocument` / `WriteOffItem` | Postable write-off document owned by `inventory` |
| `InventoryCount` / `InventoryCountItem` | Snapshot + reconciliation stock count document owned by `inventory` |
| Policy fields on Item / `InventoryPolicy` | FEFO/FIFO, shelf life, lot required, fractional qty, reservation eligibility, write-off rules |

Ids: `organizationId`, `storeId`, `warehouseId` on stock rows/ops.

## Allowed dependencies

- `org-structure` (warehouse validity)
- `master-data` (Item + policy read)
- `audit`

## Forbidden dependencies

- Writing Supply/Order/Sale tables
- `analytics` commanding stock
- Dual ledgers per item class

## Commands

| Command | Effect |
|---------|--------|
| `PostGoodsReceipt` | Batches + RECEIPT movements |
| `PostWriteOff` | `WRITE_OFF` |
| `DispatchTransfer` / `ReceiveTransfer` | `TRANSFER_OUT` + `TRANSFER_IN` via `InventoryTransferPort` |
| `PostSaleIssue` | ISSUE_SALE with policy allocation |
| `PostStockCountAdjustment` | `INVENTORY_ADJUSTMENT_IN` / `INVENTORY_ADJUSTMENT_OUT` |
| `ReverseMovements` | Compensating entries |
| `Reserve` / `Release` / `Consume` / `IssueForSale` / `ReverseIssue` | Reservation holds; Sale complete issues stock (ADR-017) |

## Events

- `BatchCreated`
- `InventoryMovementPosted`
- `BalanceChanged`
- `ReservationChanged`

## Posting rules

1. All qty changes append movements; never update balance without a movement in the same transaction.
2. Allocation uses InventoryPolicy (FEFO/FIFO, expiry).
3. Fractional qty rejected if policy disallows.
4. Movements store `sourceDocumentType` + `sourceDocumentId`.
5. Idempotent per document post.
6. Write-off consumes only available, unreserved stock; reserved stock rejection returns `STOCK_RESERVED` (ADR-035).
7. Transfer dispatch decreases source stock; transfer receipt creates destination batches at preserved source unit cost (ADR-034).
8. Inventory count uses snapshot + movement reconciliation with no warehouse freeze; positive adjustments use last-known weighted average cost (ADR-032/033).

## Cancellation rules

- No delete of Batch or InventoryMovement.
- Reversals create new movements referencing originals.
- Depleted batches remain for history.

## Audit requirements

Every post and reverse → AuditLog (who, when, document, qty, warehouse).

## v1

- Ledger + batch on receipt + balances (`onHand` / `reserved` / `available`)
- Order reservations via `InventoryReservationPort`
- Sale issue via `InventoryIssuePort`: consume reservations, FEFO/FIFO top-up, ISSUE / ISSUE_REVERSAL
- Write-off documents + reversals
- Inventory counts with snapshot/reconciliation posting
- Transfer dispatch/receive/reversal via `InventoryTransferPort` for `transfers` bounded context
- Used by Supply receipt + Orders reservation + Sales complete + Transfers + Inventory Ops

## Deferred

- Location/bin
- Serial numbers
- Negative stock allowances (unless explicit policy)
