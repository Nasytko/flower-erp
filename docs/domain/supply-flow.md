# Domain Flow: Supply (Поставка)

**Status:** Accepted  
**Module:** `supply` (+ posts into `inventory`, `audit`)

## Responsibility

Manage inbound procurement as **one user-facing process** (“Поставка”) with a clear status lifecycle, while internally separating intent (`Supply`) from actual receipt posting (`GoodsReceipt`).

## Boundaries

- Does **not** own batches, movements, or balances (Inventory does).
- Does **not** own supplier master (Master Data), but references Supplier.
- Does **not** create Sale/Order/Payment.
- UI must not force users to manage GoodsReceipt as an unrelated second business object; nested under Supply is preferred.

## Main entities

| Entity | Role |
|--------|------|
| `Supply` | Header: supplier, store/warehouse, status, totals expected |
| `SupplyItem` | Expected item, qty, agreed price |
| `GoodsReceipt` | Actual receipt event against a Supply |
| `GoodsReceiptItem` | Accepted qty, defect qty, shortage vs expected, unit cost |

Ids: `organizationId`, `storeId`, `warehouseId` on headers as applicable.

## Allowed dependencies

- `org-structure` (validate store/warehouse)
- `master-data` (Item, Supplier)
- `inventory` posting port
- `audit` append port
- `notifications` (optional on status changes)

## Forbidden dependencies

- Direct Prisma writes to inventory tables
- `analytics` mutations
- `orders` / `sales` / CRM
- Hard delete of supply/receipt rows

## Commands

| Command | Effect |
|---------|--------|
| `CreateSupplyDraft` | Status `DRAFT` |
| `UpdateSupplyDraft` | Only while `DRAFT` |
| `SubmitSupplyToSupplier` | `SUBMITTED_TO_SUPPLIER` |
| `RecordAndPostGoodsReceipt` | Create receipt lines + **post** |
| `AnnulSupply` | `ANNULLED` with rules below |

## Events (in-process)

- `SupplyCreated`
- `SupplySubmitted`
- `GoodsReceiptPosted`
- `SupplyPartiallyReceived`
- `SupplyFullyReceived`
- `SupplyCancelled`
- `SupplyDefectRecorded` / shortage indicated on lines

## Posting rules

On Goods Receipt post (same DB transaction):

1. Validate Supply status ∈ {`SUBMITTED_TO_SUPPLIER`, `PARTIALLY_RECEIVED`}.
2. For each accepted qty > 0: Inventory port creates **Batch** + `RECEIPT` **InventoryMovement**; balance updated.
3. Defect / under-delivery stored on `GoodsReceiptItem` (and optional SupplyItem received aggregates).
4. Recompute Supply status → `PARTIALLY_RECEIVED` or `RECEIVED`.
5. Append `AuditLog`.
6. Batch is never created as a standalone user document.

## Cancellation rules

| State | Rule |
|-------|------|
| `DRAFT` / `SUBMITTED_TO_SUPPLIER` without posts | Annul; no stock reverse |
| With posted receipts | Cancel remaining intent; each posted receipt must be reversed via inventory reversing movements before supply can be fully annulled, **or** cancel supply for unreceived remainder only (product rule: prefer explicit `CancelGoodsReceipt` reverse then cancel supply) |
| `RECEIVED` | Not silently deleted; reverse receipts then mark cancelled if business allows annulment |

No physical delete of Supply, SupplyItem, GoodsReceipt, GoodsReceiptItem.

## Audit requirements

Log: create, submit, each receipt post (with quantities), cancel, reverse receipt.

## v1

- Statuses: `DRAFT` → `SUBMITTED_TO_SUPPLIER` → `PARTIALLY_RECEIVED` → `RECEIVED`; draft-only annul → `ANNULLED`
- Internal Supply + GoodsReceipt model
- Defect and shortage on receipt lines
- Post → batch + movement + balance + audit

## Deferred

- Separate formal PO document in UX
- Supplier portal / EDI
- Automatic purchase price lists
- Outbox to notify external systems
