# Flower ERP — Architecture Overview

**Status:** Accepted  
**Product:** Flower ERP (not CRM)  
**Last updated:** 2026-07-15

## Purpose

Flower ERP is a multi-store operations system for flower retail: supply, inventory, orders, POS sales, payments, delivery, and management finance.

This document is the entry point for the system architecture. Detailed rules live in sibling docs and ADRs.

## Architectural style

**Modular monolith.**

| Layer | Choice |
|-------|--------|
| API | `apps/api` — NestJS |
| Backoffice UI | `apps/backoffice` — Next.js |
| Database | PostgreSQL (DBaaS) via Prisma |
| Monorepo | pnpm + Turborepo |
| Local infra | Docker for development dependencies only as needed for Postgres |
| Packaging | Shared packages for types/contracts; domain logic stays in API modules |

Not used in v1: Redis, message queues, Kafka, RabbitMQ, object storage, Telegram, AI, public storefront.

Transactional Outbox is an **accepted future pattern** (see ADR-003 / ADR-007). No worker, Redis, or empty outbox tables are introduced in v1.

## Core principles

1. **Document posting over CRUD.** Stock and money change only through postable documents and immutable movements.
2. **Single inventory ledger.** Flowers and materials share one Inventory module; differences are `ItemType` + `InventoryPolicy`.
3. **Tenancy everywhere.** Every transactional entity has `organizationId`; store/warehouse scoped entities also carry the matching ids.
4. **Module data ownership.** No shared Prisma God Repository; modules may not reach another module’s tables directly.
5. **No hard deletes** for operational/financial/stock documents and ledger rows. Use cancellation and reversing movements.
6. **CRM deferred.** No Customer/CRM bounded context in v1. Client contact data is an **order snapshot**. A future CRM module must remain possible without rewriting Order posting.

## High-level module map

```
apps/api
├── platform          IAM, auth, users, permissions
├── org-structure     Organization, Store, Warehouse
├── master-data       Item, Supplier, UoM, categories, reasons, payment methods
├── catalog           Sellable offers, bouquet composition (BOM) — thin in early phases
├── supply            Supply + GoodsReceipt (UX: one supply process)
├── inventory         Batches, movements, balances, policies, reservations
├── orders            Order, OrderItem, fulfillment
├── sales             Sale, SaleItem, Shift
├── payments          Payment (owned by finance or sales-facing façade — see module-map)
├── delivery          Delivery linked to Order
├── finance           Expenses, tax, management P&L / cash flow projections
├── notifications     In-app notifications only (v1)
├── analytics         Read-model queries, dashboard/report projections
└── audit             AuditLog append-only trail
```

`Dashboard` and `Reports` are **not** operational bounded contexts. They are read/query capabilities over analytics projections and must not mutate business modules.

## Document families (summary)

| Family | User-facing concept | Internal docs | Posts to |
|--------|---------------------|---------------|----------|
| Supply | Поставка (single process) | Supply, GoodsReceipt | Inventory ledger + AuditLog |
| Stock | Списание, перемещение, инвентаризация | WriteOff, Transfer, StockCount | Inventory ledger + AuditLog |
| Commercial | Заказ | Order | Reservations / later stock on fulfill |
| Commercial | Продажа | Sale | Inventory + finance facts |
| Money | Платёж / расход / налоги | Payment, Expense, TaxAccrual/Payment | Finance projections + AuditLog |
| Delivery | Доставка | Delivery | Status + notifications; not a stock document by itself |

Batch (партия) is a **stock dimension**, not a document.

## Organizational hierarchy

```
Organization
└── Store
    └── Warehouse (default one per store; many allowed later)
```

`Location` is out of scope.

## Vertical slice for first implementation

Recommended first end-to-end path (no POS/Order yet):

`Store → Supplier → Item → Supply → Goods Receipt → Batch → Inventory Movement → Balance → AuditLog`

See [development-phases.md](./development-phases.md).

## Related documents

| Doc | Topic |
|-----|-------|
| [module-map.md](./module-map.md) | Modules, entities, boundaries |
| [dependency-rules.md](./dependency-rules.md) | Allowed/forbidden dependencies |
| [document-posting.md](./document-posting.md) | Posting, reverse, immutability |
| [tenancy.md](./tenancy.md) | Org / store / warehouse scope |
| [security.md](./security.md) | AuthN/AuthZ |
| [api-guidelines.md](./api-guidelines.md) | API conventions |
| [data-ownership.md](./data-ownership.md) | Persistence ownership |
| [development-phases.md](./development-phases.md) | Phased delivery |
| [adr/](./adr/) | Architecture Decision Records |
| [../domain/](../domain/) | Domain flow specs |
