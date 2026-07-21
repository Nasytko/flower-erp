# Document Posting and Ledgers

**Status:** Accepted  
**Related:** [ADR-003](./adr/003-document-posting-and-ledgers.md), domain flows under `docs/domain/`

## Intent

Flower ERP is document-centric. Operational truth for stock and management money moves through **postable documents** that append **immutable movements**. UI may look like simple forms; internally every quantity/money change is attributable to a document.

## Definitions

| Term | Meaning |
|------|---------|
| Document | Business header with status lifecycle (Supply, GoodsReceipt, WriteOff, Transfer, InventoryCount, Sale, Payment, Expense, …) |
| Posting | Transition that makes a document effective: creates immutable movements / facts |
| Movement | Append-only ledger entry (inventory or, where applicable, finance fact lines) |
| Batch / Lot | Stock dimension created by receipt posting — **not** a document |
| Balance | Projection derived from movements (maintained only by inventory posting) |
| Reverse | Compensating movement referencing the original; used instead of delete |
| Cancel / Annul | Document status change + required reverses; row remains |

## Hard rules

1. **No direct balance edits** from API or UI. Adjustments go through Stock Count / Adjustment documents that post movements.
2. **No hard delete** for: Supply, GoodsReceipt, Batch, InventoryMovement, Order, Sale, Payment, Expense, TaxAccrual, TaxPayment, and other posted financial/stock artifacts listed in product policy.
3. **Idempotent posting:** re-post of an already posted document is a no-op or conflict error — never double-issue stock.
4. **Organization scoping:** every posted movement carries `organizationId` (+ `storeId` / `warehouseId` when applicable).
5. **Audit:** successful post and reverse append `AuditLog`.

## Inventory ledger

### Movement types (logical)

- `RECEIPT` — from Goods Receipt
- `ISSUE` / `ISSUE_REVERSAL` — from Sale post and reversal
- `WRITE_OFF` / `WRITE_OFF_REVERSAL` — from Write-off document
- `TRANSFER_OUT` / `TRANSFER_IN` — pair from Transfer document
- `TRANSFER_OUT_REVERSAL` / `TRANSFER_IN_REVERSAL` — compensating transfer lines
- `INVENTORY_ADJUSTMENT_IN` / `INVENTORY_ADJUSTMENT_OUT` / `INVENTORY_ADJUSTMENT_REVERSAL` — from stock count posting / reversal logic
- `RECEIPT` / `RECEIPT_REVERSAL` — from Goods Receipt

### Batch

Created by receipt or other explicit inbound document (`TRANSFER_IN`, positive count adjustment). Holds qty, unit cost, expiry, policy-relevant attributes. Quantity available changes only via movements referencing the batch.

### Policy application

On issue, `InventoryPolicy` selects allocation (FEFO/FIFO), whether fractional qty allowed, whether lot required, etc.

### Reservations (Orders)

- Confirm/reserve of an Order calls `InventoryReservationPort` inside the same `UnitOfWork` as the order status change.
- Successful allocation: `InventoryReservation` ACTIVE + `ReservationMovement` RESERVE + `InventoryBalance.reservedQuantity` ↑ (`available = onHand - reserved`).
- Partial ACTIVE holds allowed (ADR-015).
- Cancel/retry releases via `ReservationMovement` RELEASE.

### Sale issue (ADR-016 / ADR-017)

- `CompleteSale` calls `InventoryIssuePort.issueForSale` in the same UnitOfWork.
- Consume ACTIVE reservations for ActualComposition lines; RELEASE excess; ISSUE extra from free stock FEFO/FIFO.
- Append `InventoryMovement` ISSUE; update batch remaining + balances; return COGS allocations.
- `AnnulSale` → ISSUE_REVERSAL; does not restore reservations.

### Write-off posting (EPIC 12)

- `PostWriteOff` validates available stock only; reserved stock is not auto-released.
- Allocation uses the same FEFO/FIFO policy path as sale issue.
- Posting appends `WRITE_OFF`, decreases batch remaining quantity, and updates balances.
- `ReverseWriteOff` appends `WRITE_OFF_REVERSAL`.

### Transfer posting (EPIC 12)

- `DispatchTransfer` appends `TRANSFER_OUT` at source and creates transfer allocations.
- `ReceiveTransfer` appends `TRANSFER_IN` at destination and creates destination batches at preserved dispatch cost.
- In-transit quantity is derived from transfer allocations minus received/damaged quantities; it is not a separate mutable balance.

### Inventory count posting (EPIC 12)

- `CreateInventoryCount` captures a cutoff snapshot.
- `PostInventoryCount` reconciles movements after cutoff and posts only the remaining variance.
- Positive adjustments use last-known weighted average cost; zero-cost inbound adjustment is forbidden.

## Finance (management)

Not a double-entry GL. Posting creates management facts:

- Expense posted → included in P&L / cash flow projections
- Tax accrual / tax payment documents
- Sale and Payment facts feed store profitability and cash flow

Reversals create cancel documents or reversing facts; rows remain.

## Supply posting (canonical)

User sees one Supply process. Internally:

1. `Supply` + `SupplyItem` express intent/quantities ordered from supplier.
2. `GoodsReceipt` + `GoodsReceiptItem` capture what actually arrived (incl. defect/shortage).
3. **Post GoodsReceipt** (inventory port):
   - create `Batch` rows for accepted qty;
   - append `InventoryMovement` RECEIPT;
   - recalculate / update `InventoryBalance`;
   - record defect & under-delivery on receipt/supply lines;
   - append `AuditLog`;
   - update Supply status to `PARTIALLY_RECEIVED` or `RECEIVED`.

See [../domain/supply-flow.md](../domain/supply-flow.md).

## Sale posting (summary)

Posting a `Sale`:

- freezes sale lines;
- issues stock movements per policy (batch allocation);
- links optional `Order`;
- expects `Payment` as separate operation (may be same user transaction, different document);
- audit + optional tax snapshot via finance rules.

Posting a `Payment` (Epic 09):

- completes DRAFT → COMPLETED in one UnitOfWork;
- appends `CashOperation` (`PAYMENT_RECEIPT` IN / annulment OUT / refund OUT);
- uses `posting_idempotency_keys` scopes (`payment-complete`, `payment-annul`, `refund-complete`, `refund-annul`, `prepayment-transfer`);
- notifies Order/Sale timelines via ports (not foreign-table writes from payments for those entities beyond published ports);
- never issues inventory.

## Cancellation patterns

| Situation | Action |
|-----------|--------|
| Draft document | Cancel status; no movements |
| Posted receipt | Reverse RECEIPT movements; mark receipt cancelled; adjust supply status |
| Posted write-off | Reverse WRITE_OFF movements; mark write-off reversed |
| Dispatched/received transfer | Reverse transfer movements; mark transfer reversed/cancelled |
| Draft count | Cancel status; no movements |
| Posted count | Do not delete; future correction is a new count or explicit adjustment document |
| Posted sale | Reverse ISSUE movements; cancel sale; handle payments via refund |
| Payment | Annul completed payment (cash reversal) or refund payment document |
| Expense | Cancel expense fact |

Never `DELETE FROM` protected tables.

## Transactional Outbox (future)

When integrations appear (Telegram, webhooks, partner API), posting SHOULD also write outbox rows in the **same DB transaction** as movements. **v1 does not implement outbox tables or workers** (ADR-007). Domain events remain in-process.

## Anti-patterns

- Creating Batch from UI without GoodsReceipt
- Editing `quantityAvailable` on Batch manually
- Using Order as Sale
- Dashboard endpoints that “fix” stock
- Soft-delete flags that hide rows while allowing re-insert of same business number without reverse trail
