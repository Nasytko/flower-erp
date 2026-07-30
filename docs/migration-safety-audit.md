# Migration safety audit

Audit date: 2026-07-30. Scope: `apps/api/prisma/migrations/**/migration.sql`.

Legend:

| Status | Meaning |
|--------|---------|
| **fixed** | Addressed in `20260730120000_remove_transfers_counts_cash` hardening |
| **legacy** | Applied in production before the safety pipeline; not modified |
| **ok** | No production-blocking risk identified |

## Summary

| Risk category | Count | Notes |
|---------------|-------|-------|
| Enum recreate without DROP DEFAULT | 2 | 1 legacy (`20260729150000` partial), 1 **fixed** |
| DROP TABLE without guards | 3 | 2 legacy, 1 **fixed** |
| DROP COLUMN | 2 | 1 legacy, 1 **fixed** |
| Missing transaction wrapper | 4 | 3 legacy, 1 **fixed** |
| SET NOT NULL without backfill | 1 | legacy |

---

## Enum recreation (`CREATE TYPE *_new`)

| Migration | Table.Column | Old → New enum | Default before | Default after | Risk | Status |
|-----------|--------------|----------------|----------------|---------------|------|--------|
| `20260729150000_remove_unused_enum_values` | `payment_methods.type` | PaymentMethodType | none | none | Missing DROP DEFAULT (harmless) | legacy |
| `20260729150000_remove_unused_enum_values` | `sales.sales_channel` | SalesChannel | `'STORE'` | `'STORE'` | Correct DROP/SET DEFAULT pattern | ok |
| `20260730120000_remove_transfers_counts_cash` | `inventory_batches.batch_source_type` | InventoryBatchSourceType | `'GOODS_RECEIPT'` | `'GOODS_RECEIPT'` | Failed in prod: default cast | **fixed** |
| `20260730120000_remove_transfers_counts_cash` | `inventory_movements.type` | InventoryMovementType | none | none | No default; uses `@no-default` | **fixed** |

---

## DROP TABLE

| Migration | Tables | Data handling | Risk | Status |
|-----------|--------|---------------|------|--------|
| `20260729140000_remove_obsolete_erp_tables` | timeline, route, reservation tables | `DROP TABLE IF EXISTS` only | Silent drop if rows exist | legacy |
| `20260730120000_remove_transfers_counts_cash` | cash, transfer, count tables | Explicit DELETE + empty-table guards | Silent data loss without review | **fixed** |

Production note: `20260730120000` intentionally removes module data after runtime code was deleted. Guarded by `@destructive-reviewed` and post-delete row-count checks.

---

## DROP COLUMN

| Migration | Table.Column | Risk | Status |
|-----------|--------------|------|--------|
| `20260715210000_master_data_hardening_and_supply_inventory` | `inventory_policies.allow_fractional_quantity` | No backfill/guard | legacy |
| `20260730120000_remove_transfers_counts_cash` | `inventory_batches.transfer_allocation_id`, `inventory_count_item_id` | FK order dependency | **fixed** |

---

## SET NOT NULL

| Migration | Table.Column | Backfill | Status |
|-----------|--------------|----------|--------|
| `20260717130000_inventory_operations_hardening` | `inventory_counts.cutoff_at` | Assumes existing rows populated | legacy |

---

## Other destructive patterns

| Migration | Pattern | Risk | Status |
|-----------|---------|------|--------|
| All legacy | No `BEGIN/COMMIT` on destructive SQL | Partial apply on error | legacy |
| `20260730120000_remove_transfers_counts_cash` | Wrapped in transaction | Rollback on failure | **fixed** |

---

## Production apply guidance

| Migration | Safe to apply on production? |
|-----------|------------------------------|
| All migrations before `20260730120000` | Already applied |
| `20260730120000_remove_transfers_counts_cash` (hardened) | **Yes**, after `migrate resolve --rolled-back` if marked failed |

Pre-deploy requirements (new pipeline):

1. `pnpm migration:safety`
2. `bash scripts/test-migrations.sh`
3. `pnpm verify:release`

See [database-change-workflow.md](./database-change-workflow.md).
