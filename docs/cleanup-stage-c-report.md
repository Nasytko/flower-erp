# Flower ERP — Stage C Cleanup Report

**Status:** Stage C complete (schema + migrations prepared; **not applied to production**)  
**Date:** 2026-07-29  
**Related:** [cleanup-audit.md](./cleanup-audit.md), [database-cleanup-plan.md](./database-cleanup-plan.md), [cleanup-stage-b-report.md](./cleanup-stage-b-report.md)

---

## 1. Summary

Stage C removed obsolete Prisma models, dropped specialized timeline/ledger tables, simplified reservation persistence to `InventoryReservation` + balance fields, and removed unused enum values (`GIFT_CERTIFICATE`, `SalesChannel.TELEGRAM`) via safe PostgreSQL migrations with pre-check guards.

| Area | Outcome |
|------|---------|
| Prisma models removed | 10 |
| Migrations created | 2 |
| Runtime timeline writes | Removed (AuditLog retained) |
| ReservationMovement ledger | Removed; state on `InventoryReservation` |
| PaymentAllocation | **Kept** — 1:1 payment→order/sale link |
| PaymentAllocationTransfer | Removed |
| Enum cleanup | GIFT_CERTIFICATE, TELEGRAM removed (migration aborts if rows exist) |

---

## 2. Removed Prisma models / tables

| Model | Table |
|-------|-------|
| `DeliveryRoutePlan` | `delivery_route_plans` |
| `DeliveryRouteStop` | `delivery_route_stops` |
| `PaymentAllocationTransfer` | `payment_allocation_transfers` |
| `OrderCompositionReplacement` | `order_composition_replacements` |
| `OrderTimelineEvent` | `order_timeline_events` |
| `SaleTimelineEvent` | `sale_timeline_events` |
| `PaymentTimelineEvent` | `payment_timeline_events` |
| `DeliveryTimelineEvent` | `delivery_timeline_events` |
| `TransferTimelineEvent` | `transfer_timeline_events` |
| `ReservationMovement` | `reservation_movements` |

### Removed enums (with models)

`RoutePlanStatus`, `CompositionReplacementReason`, `OrderTimelineEventType`, `SaleTimelineEventType`, `PaymentTimelineEventType`, `DeliveryTimelineEventType`, `TransferTimelineEventType`, `ReservationMovementType`

### Enum values removed (separate migration)

| Enum | Value | Guard |
|------|-------|-------|
| `PaymentMethodType` | `GIFT_CERTIFICATE` | Raises if any `payment_methods` or linked `payments` rows |
| `SalesChannel` | `TELEGRAM` | Raises if any `sales.sales_channel = TELEGRAM` |

---

## 3. Migrations

| Migration | Purpose |
|-----------|---------|
| `20260729140000_remove_obsolete_erp_tables` | DROP 10 tables + 8 enums (FK-safe order) |
| `20260729150000_remove_unused_enum_values` | Recreate `PaymentMethodType` and `SalesChannel` without deprecated values |

**Not applied to production.** Apply only after backup + audit SQL on target environment.

---

## 4. Data audit & backup tooling

| Artifact | Path |
|----------|------|
| Audit SQL (SELECT only) | `scripts/audit-removable-data.sql` |
| Backup script | `scripts/backup-stage-c-tables.sh` |
| Backup output dir | `backups/stage-c-YYYYMMDD-HHMMSS/` (gitignored) |

### Data audit results (local)

**Not executed** — `psql` / Docker unavailable in CI/dev shell. Run manually before production:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/audit-removable-data.sql
DATABASE_URL=... ./scripts/backup-stage-c-tables.sh
```

Mark tables with `row_count > 0` as **DATA_PRESENT** before deploy.

---

## 5. Runtime dependency audit

### Removed (runtime)

- All `*TimelineEvent` Prisma writes across orders, sales, payments, delivery, transfers
- `ReservationMovement.create` in reservation/issue adapters
- `PaymentAllocationTransfer.create` and `allocateOrderPrepaymentsToSale`
- `OrderCompositionReplacement.create` and `replaceCompositionItem`
- Route planning DTOs/enums (already dead since Stage B)

### Kept

- `DeliveryJob`, board/calendar/map, couriers, geocoding, `DeliveryProblem`
- `InventoryReservation` (ACTIVE/RELEASED/CONSUMED) + `inventory_balances.reservedQuantity`
- `PaymentAllocation` — required link between payment and order/sale target
- `AuditLog` — sole append-only audit trail

### Documentation / migration history (unchanged)

Old migrations referencing dropped tables remain in `apps/api/prisma/migrations/` (not edited).

---

## 6. Reservation simplification

**Before:** reserve/release/consume wrote `ReservationMovement` ledger rows + updated balances.

**After:** only `InventoryReservation.status` and `inventory_balances.reservedQuantity` / `availableQuantity`.

Invariant preserved:

```text
availableQty = onHandQty - activeReservedQty
```

### New/updated tests

`apps/api/test/integration/reservation-invariants.integration.test.ts`:

- Cancel releases reservation
- Competing orders respect available stock
- Double sale complete does not double-issue
- `reservation_movements` table absent post-migration

Existing: `orders-reservation.integration.test.ts`, `sales-issue.integration.test.ts`

---

## 7. PaymentAllocation role (kept)

`PaymentAllocation` remains the technical link:

- `paymentId` → `Payment`
- `targetType` + `targetId` → Order or Sale
- Supports partial payments, multiple payments per order, refunds

Cross-order prepayment transfer (`PaymentAllocationTransfer`) removed — payments cannot be reallocated to a different independent order.

---

## 8. Verification results

| Check | Result |
|-------|--------|
| `pnpm lint` | Pass |
| `pnpm typecheck` | Pass |
| `pnpm test` (unit) | Pass — 84 pass; integration/e2e skipped without `DATABASE_URL` |
| `pnpm --filter @flower/api build` | Pass |
| `pnpm --filter @flower/backoffice build` | Pass |
| `pnpm depcruise` | 6 pre-existing violations (unchanged) |
| Migration test (clean DB) | **Not run** — no local PostgreSQL/Docker |
| Migration test (DB with data) | **Not run** — requires staging |
| Smoke tests (manual) | **Not run** — requires running stack |

### Pre-existing dependency-cruiser violations

1. `order-list-phase-filter.ts` → Prisma (domain)
2. `inventory-movement-delta.ts` → Prisma (domain)
3. `write-off.use-cases.ts` → Prisma (application)
4. `inventory-count.use-cases.ts` → Prisma (application)

---

## 9. Production deployment plan (prepare only — do not auto-run)

1. Enable maintenance/read-only mode if available
2. Full DB backup: `pg_dump "$DATABASE_URL" > backup-full-$(date +%Y%m%d).sql`
3. Run `scripts/backup-stage-c-tables.sh`
4. Run `scripts/audit-removable-data.sql` — verify expected row counts
5. Deploy application build **without** timeline/ledger code (this commit)
6. `pnpm --filter @flower/api exec prisma migrate deploy`
7. Smoke tests: login, /today, order reserve/cancel, sale, payment, delivery assign
8. Check API health + logs
9. Disable maintenance mode

### Rollback

1. Restore full DB backup (Prisma cannot auto-rollback destructive migrations)
2. Redeploy previous application image/tag
3. Verify health endpoints

---

## 10. Known issues / deferred

- **DATA audit on production:** must be run manually before migrate deploy
- **Timeline history:** rows in dropped tables are lost unless exported via backup; `AuditLog` is the forward-looking trail
- **fancy-select.tsx** still displays gift-certificate icon by name heuristic for legacy records

---

## 11. Files changed (summary)

- `apps/api/prisma/schema.prisma` — models/enums removed
- `apps/api/prisma/migrations/20260729140000_*` — table drops
- `apps/api/prisma/migrations/20260729150000_*` — enum value removal
- 30+ API module files — timeline/ledger/transfer/replacement removal
- `packages/api-client/src/index.ts` — order detail without timeline
- `scripts/audit-removable-data.sql`, `scripts/backup-stage-c-tables.sh`
- `apps/api/test/integration/reservation-invariants.integration.test.ts`
- Docs: this report, `database-cleanup-plan.md` status update
