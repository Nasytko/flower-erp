# Module Map

**Status:** Accepted  
**Related:** [overview.md](./overview.md), [dependency-rules.md](./dependency-rules.md), [data-ownership.md](./data-ownership.md)

## How to read this document

For each module:

- **Responsibility** — what it owns
- **Boundaries** — what it explicitly does not own
- **Main entities** — persistence owned by the module
- **Allowed dependencies** — other modules it may call (application services / published ports)
- **Forbidden dependencies** — must not import or query
- **Commands / Events** — application layer contracts (logical; not implemented here)
- **Posting / Cancellation / Audit** — where applicable
- **v1 vs deferred**

Events in v1 are **in-process domain events** (same process, synchronous or async handlers inside the monolith). No broker. Outbox is documented for future use only.

---

## 1. `platform`

| Aspect | Definition |
|--------|------------|
| Responsibility | Authentication, sessions/tokens, user accounts, roles/permissions scaffolding |
| Boundaries | No business documents, stock, or finance |
| Main entities | `User`, `RefreshToken` (or equivalent), permission assignments |
| Allowed deps | `org-structure` (read store/org membership for claims) |
| Forbidden deps | supply, inventory, orders, sales, finance, analytics write paths |
| Commands | `RegisterUser`, `Authenticate`, `RefreshSession`, `RevokeSession`, `UpdateUserStatus` |
| Events | `UserAuthenticated`, `UserDeactivated` |
| Posting | N/A |
| Cancellation | Soft-deactivate users; tokens revoked |
| Audit | Login failures, role changes, deactivation |
| v1 | JWT access + refresh, org-scoped users, coarse roles |
| Deferred | Fine-grained permission matrix UI, SSO, SCIM |

---

## 2. `org-structure`

| Aspect | Definition |
|--------|------------|
| Responsibility | Tenant and site model: Organization, Store, Warehouse lifecycle |
| Boundaries | No balances, no items, no documents |
| Main entities | `Organization`, `Store`, `Warehouse` |
| Allowed deps | none (leaf master for topology) |
| Forbidden deps | inventory, supply, orders, finance |
| Commands | `CreateOrganization`, `CreateStore`, `UpdateStore`, `EnsureDefaultWarehouse`, `CreateWarehouse`, `DeactivateStore/Warehouse` |
| Events | `OrganizationCreated`, `StoreCreated`, `WarehouseCreated`, `StoreDeactivated` |
| Posting | Creating a Store **must** create one default primary Warehouse |
| Cancellation | Deactivate, never hard-delete if referenced |
| Audit | Structure changes |
| v1 | Org → Store → one default Warehouse; allow additional warehouses via API/model |
| Deferred | Location / bin hierarchy |

---

## 3. `master-data`

| Aspect | Definition |
|--------|------------|
| Responsibility | Reference and item master data used across ERP |
| Boundaries | No stock quantities; no commercial order/sale headers; no tax calculation engine (rules metadata only if co-owned with finance—prefer tax rules in finance) |
| Main entities | `Item`, `ItemCategory`, `UnitOfMeasure`, `Supplier`, `WriteOffReason`, `DiscountReason`, `PaymentMethod` (catalog of methods), other reason codes |
| Allowed deps | `org-structure` (validate org) |
| Forbidden deps | inventory balances, supply posting, orders, sales |
| Commands | `CreateItem`, `UpdateItem`, `SetItemPolicyRef`, `CreateSupplier`, `Deactivate*` |
| Events | `ItemCreated`, `ItemDeactivated`, `SupplierCreated` |
| Posting | N/A (master data changes are not stock posts) |
| Cancellation | Deactivate; no hard delete if referenced by docs |
| Audit | Master data changes |
| v1 | Item + ItemType + InventoryPolicy binding, Supplier, UoM, core reasons |
| Deferred | Rich media, multi-barcode packs, vendor catalogs |

**Note:** Client/Customer master is **not** in this module in v1 (no CRM). Contact fields live on Order as snapshot.

---

## 4. `catalog`

| Aspect | Definition |
|--------|------------|
| Responsibility | Sellable offers and bouquet BOM (components → Items) |
| Boundaries | Does not own on-hand qty; does not post inventory |
| Main entities | `Offer` / `Bouquet`, `BouquetComponent` (BOM lines) |
| Allowed deps | `master-data` (items), `org-structure` |
| Forbidden deps | inventory writes, supply, finance |
| Commands | `CreateBouquet`, `UpdateBom`, `ActivateOffer` |
| Events | `BouquetBomChanged` |
| v1 | Minimal: enough for later order lines; may be thin until Order phase |
| Deferred | Price lists, channel-specific catalogs |

---

## 5. `supply`

| Aspect | Definition |
|--------|------------|
| Responsibility | Inbound procurement process presented to users as **one Supply (“Поставка”)** with statuses; internally Supply + GoodsReceipt |
| Boundaries | Does not store ledger balances; does not own Batch as a document |
| Main entities | `Supply`, `SupplyItem`, `GoodsReceipt`, `GoodsReceiptItem` |
| Allowed deps | `org-structure`, `master-data`, `inventory` (**posting port only**), `audit` |
| Forbidden deps | orders, sales, finance taxes (except reading payment methods if needed—prefer not), analytics writes |
| Commands | `CreateSupplyDraft`, `SubmitSupplyToSupplier`, `RecordGoodsReceipt`, `CompleteSupply`, `CancelSupply` |
| Events | `SupplySubmitted`, `GoodsReceiptPosted`, `SupplyFullyReceived`, `SupplyCancelled`, `SupplyShortageRecorded`, `SupplyDefectRecorded` |
| Posting rules | Receipt posts via Inventory port: create batches + movements; update supply status (partial/full); write AuditLog |
| Cancellation | Annul open supply; posted receipts reversed via inventory reversing movements (never delete) |
| Audit | Status transitions, receipt post, cancel, defect/shortage |
| v1 | Draft → sent → partial/full received → cancelled; receipt creates batches/movements |
| Deferred | Formal PO vs Supply split in UX, EDI, supplier portal |

User-facing statuses:

- `DRAFT`
- `SUBMITTED_TO_SUPPLIER`
- `PARTIALLY_RECEIVED`
- `RECEIVED`
- `ANNULLED`

---

## 6. `inventory`

| Aspect | Definition |
|--------|------------|
| Responsibility | Single stock ledger: batches/lots, immutable movements, derived balances, policies, reservations |
| Boundaries | Does not own Supply/Order/Sale headers; does not own finance P&L |
| Main entities | `Batch` (lot), `InventoryMovement`, `InventoryBalance` (onHand/reserved/available), `InventoryReservation`, `ReservationMovement` |
| Allowed deps | `org-structure`, `master-data` (read Item + policy), `audit` |
| Forbidden deps | direct updates from controllers; finance; analytics mutation of stock; reading Order tables |
| Commands | `PostGoodsReceipt`, `PostWriteOff`, `PostTransfer`, `PostSaleIssue`, `PostAdjustmentViaStockCount`, `ReverseMovement`, `ReserveForOrder` / `ReleaseForOrder` (via `InventoryReservationPort`) |
| Events | `InventoryMovementPosted`, `BatchCreated`, `BalanceChanged`, `ReservationChanged` |
| Posting rules | Only via document posting adapters; movements immutable; balances maintained from posts; reservations update `reservedQuantity` via ReservationMovement |
| Cancellation | Reverse movements; never delete movement/batch rows; release ACTIVE reservations (RELEASE ReservationMovement) |
| Audit | Every post/reverse/reserve/release |
| v1 | Ledger + batch on receipt + balances + FEFO/FIFO reservation for Orders (ADR-014) |
| Deferred | Advanced WMS, Location, serials, CONSUMED on Sale issue |

`ItemType` + `InventoryPolicy` drive FEFO/FIFO, shelf life, lot tracking, fractional qty, reservation eligibility, write-off rules. Not separate modules for flowers vs materials.

---

## 7. `orders`

| Aspect | Definition |
|--------|------------|
| Responsibility | Customer obligation + fulfillment workflow |
| Boundaries | Not a Sale; not a Payment; not Delivery; thin Customer only (not CRM) |
| Main entities | `Customer`, `Order`, `OrderComposition`/`OrderCompositionItem`, `ActualComposition`/`ActualCompositionItem`, `OrderAssignment`, `OrderTimelineEvent`, `OrderComment` |
| Allowed deps | `org-structure`, `master-data` (read), `inventory` (`InventoryReservationPort` only), `audit` |
| Forbidden deps | mutating inventory tables via Prisma; Sale/Payment/Delivery writes; CRM module |
| Commands | Customer CRUD; CreateOrder; UpdateDraft; SetPlannedComposition; ConfirmOrder; ReserveOrder; AssignFlorist; StartPreparation; UpdateActualComposition; MarkReady; CompleteOrder; CancelOrder; AddComment; GetOrderDashboard |
| Events | Timeline append-only + AuditLog |
| Posting | Reservation via inventory port only; no stock issue on READY/COMPLETE (ADR-015) |
| Cancellation | Cancel + release ACTIVE reservations |
| Audit | Commands → AuditLog; florist narrative → OrderTimeline (separate) |
| v1 | Composition engine + Customer thin + partial reserve + assignment (ADR-015) |
| Deferred | Sale/Payment/Delivery, file references, CRM merge |

---

## 8. `sales` (POS)

| Aspect | Definition |
|--------|------------|
| Responsibility | Financial fact of sale (POS or completed order conversion) and cashier shifts |
| Boundaries | Does not own Order fulfillment states; does not own tax statutory books |
| Main entities | `Sale`, `SaleLine`, `SaleDiscount`, `SaleInventoryConsumption`(+lines), `SaleTimelineEvent`, `SaleAnnulment` |
| Allowed deps | `org-structure`, `master-data` (read), `orders` (`OrdersSalesPort`), `inventory` (`InventoryIssuePort`), `audit` |
| Forbidden deps | Prisma Order/Batch/Balance/Reservation tables; Payments |
| Commands | CreateSaleFromOrder, CreateDirectSale, CompleteSale, AnnulSale |
| Posting | Complete → ISSUE + consume/release reservations; Annul → ISSUE_REVERSAL (ADR-016/017/018) |
| v1 | ORDER_BASED + DIRECT; cost/margin redaction; BYN |
| Deferred | Payment, Delivery, Fiscal, Shift/POS |

---

## 9. `payments`

Payment may live as a subdirectory of `finance` in code layout, but is a **separate operation** conceptually.

| Aspect | Definition |
|--------|------------|
| Responsibility | Record money movements linked to Order and/or Sale |
| Boundaries | Not inventory; not expense (expenses are finance); not tax accrual |
| Main entities | `Payment` |
| Allowed deps | `org-structure`, `orders`/`sales` (validate references via ports), `audit` |
| Forbidden deps | inventory |
| Commands | `CreatePayment`, `CompletePayment`, `FailPayment`, `RefundPayment` |
| Events | `PaymentCompleted`, `PaymentRefunded` |
| Cancellation | Refund / reverse payment document; no hard delete |
| Audit | All payment state changes |
| v1 | Manual methods (cash/card/transfer); link order and/or sale |
| Deferred | Acquiring webhooks, payout reconciliation |

---

## 10. `delivery`

| Aspect | Definition |
|--------|------------|
| Responsibility | Plan and execute Order fulfillment type `DELIVERY` (courier/taxi/third-party); board/map/calendar read models |
| Boundaries | Does not create Sale/Payment; does not write Order/Payment Prisma models; no route optimization |
| Main entities | `DeliveryJob`, `DeliveryAssignment`, `DeliveryProblem`, `DeliveryTimelineEvent`, `CourierProfile`, `DeliveryRoutePlan`, `DeliveryRouteStop` |
| Allowed deps | `orders` via `OrdersDeliveryPort`; `payments` via `PaymentsDeliveryReadPort`; `org-structure`; `audit`; geocoding/routing ports |
| Forbidden deps | Prisma Order/Payment/User writes; inventory; Redis; Notification table |
| Commands | CreateFromOrder, Plan, UpdateAddress, Geocode, SetCoordinates, Assign/Reassign/Release, ReadyForDispatch, Handover, StartTransit, Deliver, Cancel, Report/ResolveProblem, Courier CRUD, RoutePlan CRUD |
| Events | Timeline events; Order timeline `DELIVERY_*` via port |
| Cancellation | `CANCELLED` status (history retained); idempotent with Idempotency-Key |
| Audit | Create and key status changes |
| v1 | Manual geocoding, OSM navigation link, manual route order, COURIER role preset |
| Deferred | Paid map provider, auto route optimization, courier-only auth app |

---

## 11. `finance` (deferred — no Nest module)

Management finance — **not** statutory accounting (ADR-008). **No Nest module, Prisma models, or API surface in the current codebase**; payments live under `payments`. Keep this section as the target BC map when the module is introduced.

| Aspect | Definition |
|--------|------------|
| Responsibility | Expenses, tax rules/accruals/payments, management P&L, cash flow, store profitability projections |
| Boundaries | No General Ledger, no double-entry chart of accounts |
| Main entities | `Expense`, `ExpenseCategory`, `TaxRule`, `TaxAccrual`, `TaxPayment`; read models for P&L / CashFlow / StoreProfitability |
| Allowed deps | `org-structure`; reads facts from sales/payments/supply costs via **published read ports or projections** (not raw foreign tables) |
| Forbidden deps | inventing accounting journals; writing inventory |
| Commands | `CreateExpense`, `CancelExpense`, `DefineTaxRule`, `AccrueTax`, `RecordTaxPayment` |
| Events | `ExpensePosted`, `TaxAccrued`, `TaxPaid` |
| Posting | Expense and tax docs append-only after post |
| Cancellation | Cancel expense / reverse accrual docs |
| Audit | All finance document posts |
| Status | Deferred — do not reintroduce empty Nest scaffolds |
| Deferred further | Full GL, IFRS books, bank feeds |

---

## 12. `notifications` (deferred — no Nest module)

Persisted in-app notifications are deferred (ADR-026: calculated attention items instead). **No Nest module or Notification table.**

| Aspect | Definition |
|--------|------------|
| Responsibility | In-app notification records and read/unread state (future) |
| Boundaries | No Telegram/Email/Push adapters until product need is proven |
| Main entities | `Notification` (not implemented) |
| Status | Deferred — do not reintroduce empty Nest scaffolds |
| Deferred further | Channel adapters |

---

## 13. `analytics` (Dashboard & Reports + Workspace read models)

| Aspect | Definition |
|--------|------------|
| Responsibility | Read models, aggregations, florist Today / Work Order / Director Operations projections (ADR-025) |
| Boundaries | **Must not** mutate operational modules; **not** a separate Operations BC |
| Main entities | Optional snapshot tables (`ReportSnapshot`) only — no transactional ownership |
| Allowed deps | dedicated infrastructure read repository (org/store-scoped Prisma/SQL); Organization query for store validation |
| Forbidden deps | Orders/Inventory/Payments write repositories; claim/assign/payment mutations; God repository |
| Queries (v1) | `GET .../workspace/today`, `.../workspace/orders`, `.../workspace/orders/:id`, `.../operations`, `.../stock/operational` |
| Commands | claim/reassign/actual composition live in **orders**; analytics only projects + links |
| Events | consumes domain events to update projections (in-process later) |
| Deferred | Heavy OLAP, Excel/PDF pipeline, persisted notification inbox |

---

## 14. `audit`

| Aspect | Definition |
|--------|------------|
| Responsibility | Append-only `AuditLog` for security and operational traceability |
| Boundaries | Not a user-facing document register |
| Main entities | `AuditLog` |
| Allowed deps | none (others call audit port) |
| Forbidden deps | business posting logic inside audit |
| Commands | `AppendAudit` |
| v1 | Required on supply receipt, stock posts, sale/payment/expense cancel, tenancy-sensitive admin actions |
| Deferred | SIEM export |

---

## Apps (deployables)

| App | Role |
|-----|------|
| `apps/api` | Modular monolith hosting all modules |
| `apps/backoffice` | Staff ERP UI |

POS app may exist later as a separate deployable; until then, POS screens can live under backoffice or a future `apps/pos`. Naming of unused stubs must not contradict ADR-009.

## Explicit non-modules (v1)

- **CRM / Customer** — deferred; Order snapshot only
- **DashboardModule as BC** — screens + analytics queries only
- **ReportsModule as BC** — analytics capability only
- **Location / WMS** — deferred
- **Outbox worker** — deferred (decision only)
