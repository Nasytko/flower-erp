# Development Phases

**Status:** Accepted  
**Related:** [overview.md](./overview.md)

## Principles for phasing

1. Deliver vertical slices that exercise **document posting**, not horizontal CRUD of every entity.
2. Do not introduce Redis/queues/outbox workers “for later”.
3. Keep CRM out until Order snapshot proves insufficient.
4. Rename/align apps to `backoffice` when frontend work starts.
5. Harden tenancy (`organizationId` everywhere) before multi-store sales.

---

## Phase 0 — Architecture baseline (this documentation)

- ADRs and domain flows accepted
- Dependency and ownership rules agreed
- No business feature coding required for this phase

**Exit:** Team builds against docs without rediscussing fundamentals weekly.

---

## Phase 1 — First vertical: inbound stock

**Scenario:**  
`Store → Supplier → Item → Supply → Goods Receipt → Batch → Inventory Movement → Balance → Audit`

Deliver:

1. `org-structure`: Organization, Store, default Warehouse
2. `master-data`: Supplier, Item (+ ItemType, InventoryPolicy fields)
3. `supply`: Supply statuses + GoodsReceipt post
4. `inventory`: Batch, Movement, Balance
5. `audit`: AuditLog on receipt post
6. `platform`: auth sufficient to scope org
7. `backoffice`: minimal screens for this slice only

**Exit criteria:**

- Cannot edit balance directly via API
- Partial/full receive and cancel paths defined
- Defect/shortage recorded on receipt
- All rows carry `organizationId`; stock ops carry `warehouseId`

---

## Phase 2 — Stock documents

- Write-off document + post
- Transfer between warehouses (same org)
- Stock count / adjustment document
- Policy behaviour tests (FEFO/FIFO, expiry)

---

## Phase 3 — Order + Delivery + Payment (no CRM)

- Order with client snapshot
- Delivery entity
- Payment as separate document
- Notifications in-app for status changes (optional thin)

---

## Phase 4 — Sale / POS

- Shift open/close
- Sale from POS and from Order completion
- Inventory issue on sale post
- Cancel/reverse sale

---

## Phase 5 — Management finance

- Expense + categories
- Tax rules, accruals, payments
- Management P&L / Cash Flow / store profitability as **queries/projections**

---

## Phase 6 — Analytics UX

- Dashboard widgets (read-only)
- Report snapshots / exports (still no business mutation)

---

## Phase 7+ — Deferred platform

- Transactional Outbox + workers
- Redis / queues if needed
- External notification adapters
- Public site / partner API
- AI assistants as API clients
- CRM Customer module + link to orders
- Location/WMS

---

## Explicitly not a phase goal

- Full General Ledger
- Microservices split
- Kafka
- Rebuilding Inventory as separate flower/material services
