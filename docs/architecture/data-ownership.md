# Data Ownership

**Status:** Accepted  
**Related:** [ADR-010](./adr/010-module-data-ownership.md), [dependency-rules.md](./dependency-rules.md)

## Principle

Each module owns a disjoint set of tables (Prisma models). **Only that module’s persistence adapters** may read/write those tables.

There is **no** shared God Repository wrapping the entire Prisma schema for business use.

## Ownership table (logical)

| Module | Owns (logical tables) |
|--------|------------------------|
| platform / identity | **users**, organization_memberships, roles, permissions, role_permissions, membership_roles, user_store_access, sessions; **audit_logs** via AuditPort |
| organization | organizations, stores, warehouses |
| master-data | items, categories, uom (`quantityScale`), suppliers, inventory_policies (`presetCode`), reason catalogs |
| catalog | bouquets/offers, bouquet_components |
| supply | supplies, supply_items, goods_receipts, goods_receipt_items |
| inventory | inventory_batches, inventory_movements, inventory_balances, posting_idempotency_keys, inventory_reservations, reservation_movements, write_off_documents, write_off_items, inventory_counts, inventory_count_items |
| transfers | transfer_documents, transfer_items, transfer_allocations, transfer_timeline_events |
| orders | customers, orders, order_compositions, order_composition_items, actual_compositions, actual_composition_items, order_assignments, order_composition_replacements, order_timeline_events, order_comments |
| sales | sales, sale_lines, sale_discounts, sale_inventory_consumptions, sale_inventory_consumption_lines, sale_timeline_events, sale_annulments |
| payments | payment_methods, payments, payment_allocations, payment_allocation_transfers, payment_refunds, payment_timeline_events, cash_accounts, cash_operations; may write `posting_idempotency_keys` for payment/refund idempotency scopes |
| delivery | delivery_jobs, delivery_assignments, delivery_problems, delivery_timeline_events, courier_profiles, delivery_route_plans, delivery_route_stops; may write `posting_idempotency_keys` for deliver/cancel/resolve scopes |
| finance | **Deferred** — expenses, expense_categories, tax_rules, tax_accruals, tax_payments; finance projection tables if any (**no Nest module / tables yet**) |
| notifications | **Deferred** — no Notification table (ADR-026 calculated attention only; **no Nest module**) |
| analytics | optional report_snapshots / projection tables only; **no transactional write tables**. Workspace/Today/Operations use dedicated read-only SQL/Prisma in `analytics` (ADR-025) projecting orders/inventory/payments/sales/supply/transfers without importing write repositories. |

### Implemented in foundation slice

| Table | Owner module | Access rule |
|-------|--------------|-------------|
| `organizations` | `organization` | only org repositories |
| `stores` | `organization` | only org repositories |
| `warehouses` | `organization` | only org repositories |
| `users`, `sessions`, membership/role tables | `identity` / `auth` | only identity repositories |
| `audit_logs` | platform/audit | only `PrismaAuditAdapter` via `AuditPort` |

Organization application/use-cases **must not** import Prisma `auditLog` model. They call `AuditPort.append`.

## Cross-module references

- Foreign keys **may** exist across modules at the database level for integrity.
- Modules **must not** navigate those FKs via Prisma `include` into foreign-owned graphs for business logic belonging elsewhere.
- To load a foreign entity: call the owning module’s **query port**.

## Prisma + UnitOfWork

Repositories resolve the active Prisma client via `resolvePrismaClient(root)` so that work inside `UnitOfWork.runInTransaction` uses the **same** `Prisma.TransactionClient`. Nested transactions throw `NestedTransactionError`.

## Anti-patterns

- `InventoryService` updating `Supply.status` via Prisma
- Organization use-case writing `audit_logs` through Prisma directly
- Shared God Repository across all models
- Mutating balances or audit rows outside posting/audit ports
- Transfers business logic writing inventory batches or balances directly

## Future CRM

`customers` table would be owned by a new `crm` module. Order snapshots remain historical truth until then.
