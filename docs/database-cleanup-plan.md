# Database Cleanup Plan — Flower ERP

**Status:** Draft (Stage A — planning only)  
**Date:** 2026-07-29  
**Related:** [cleanup-audit.md](./cleanup-audit.md), [scripts/audit-removable-data.sql](../scripts/audit-removable-data.sql)

> **Do not apply destructive migration to production automatically.**  
> This plan describes Stage C work after Stages A and B are approved.

---

## 1. Scope

Stage C removes obsolete tables that duplicate `AuditLog`, over-engineer delivery/payments/reservations, or store per-replacement audit rows. Core business tables (orders, sales, inventory, payments header/allocation, delivery jobs) remain.

---

## 2. Tables to delete

| Table | Prisma model | Reason |
|-------|--------------|--------|
| `delivery_route_plans` | `DeliveryRoutePlan` | Complex route planning removed; simple courier assignment on `DeliveryJob` remains |
| `delivery_route_stops` | `DeliveryRouteStop` | Child of route plans |
| `payment_allocation_transfers` | `PaymentAllocationTransfer` | Cross-order prepayment reallocation removed |
| `order_composition_replacements` | `OrderCompositionReplacement` | Replacements folded into actual composition + comment |
| `order_timeline_events` | `OrderTimelineEvent` | Consolidated into `AuditLog` (+ optional order feed API) |
| `sale_timeline_events` | `SaleTimelineEvent` | Consolidated into `AuditLog` |
| `payment_timeline_events` | `PaymentTimelineEvent` | Consolidated into `AuditLog` |
| `delivery_timeline_events` | `DeliveryTimelineEvent` | Consolidated into `AuditLog` |
| `transfer_timeline_events` | `TransferTimelineEvent` | Consolidated into `AuditLog` |
| `reservation_movements` | `ReservationMovement` | Reservation ledger removed; state on `InventoryReservation` + order lifecycle |

### Enums to drop (with models)

| Enum | Dropped with |
|------|--------------|
| `RoutePlanStatus` | `DeliveryRoutePlan` |
| `OrderTimelineEventType` | `OrderTimelineEvent` |
| `CompositionReplacementReason` | `OrderCompositionReplacement` |
| `ReservationMovementType` | `ReservationMovement` |
| `SaleTimelineEventType` | `SaleTimelineEvent` |
| `PaymentTimelineEventType` | `PaymentTimelineEvent` |
| `DeliveryTimelineEventType` | `DeliveryTimelineEvent` |
| `TransferTimelineEventType` | `TransferTimelineEvent` |

Partial enum cleanup on `DeliveryTimelineEventType`: remove `ROUTE_ASSIGNED`, `ROUTE_ORDER_CHANGED` if enum is fully dropped.

---

## 3. Tables to simplify (not dropped in Stage C)

| Table | Action |
|-------|--------|
| `payment_allocations` | Keep 1:1 link payment → order or sale; remove transfer FK usage |
| `inventory_reservations` | Keep; add/retain status fields; stop writing movement ledger |
| `audit_logs` | Extend event coverage for actions previously in timeline tables |
| `delivery_jobs` | Remove `routeStops` relation; keep courier, address, window, status |
| `organization_integration_settings` | Keep (Yandex geocoding in use) |

---

## 4. Foreign keys removed

```
delivery_route_stops.route_plan_id     → delivery_route_plans.id
delivery_route_stops.delivery_job_id → delivery_jobs.id
delivery_route_plans.courier_profile_id → courier_profiles.id (FK on plan only)
delivery_route_plans.store_id        → stores.id

payment_allocation_transfers.*       → payments, payment_allocations, orders, sales

order_composition_replacements.order_id → orders.id

order_timeline_events.order_id       → orders.id
sale_timeline_events.sale_id         → sales.id
payment_timeline_events.payment_id   → payments.id
delivery_timeline_events.delivery_job_id → delivery_jobs.id
transfer_timeline_events.transfer_id → transfer_documents.id

reservation_movements.reservation_id → inventory_reservations.id
```

Prisma schema will also remove inverse relations:

- `DeliveryJob.routeStops`
- `CourierProfile.routePlans`
- `Store.deliveryRoutePlans` (if present)
- `Order.compositionReplacements`, `Order.timeline`
- Similar `timeline` relations on Sale, Payment, TransferDocument, DeliveryJob

---

## 5. Data to preserve before migration

### 5.1 Pre-migration checklist

1. Run `scripts/audit-removable-data.sql` on staging/production copy.
2. If any DELETE-candidate table has rows > 0, export before migration:

```bash
# Example backup (adjust connection string)
pg_dump "$DATABASE_URL" \
  --table=delivery_route_plans \
  --table=delivery_route_stops \
  --table=payment_allocation_transfers \
  --table=order_composition_replacements \
  --table=order_timeline_events \
  --table=sale_timeline_events \
  --table=payment_timeline_events \
  --table=delivery_timeline_events \
  --table=transfer_timeline_events \
  --table=reservation_movements \
  --file=backup-cleanup-candidates-$(date +%Y%m%d).sql
```

### 5.2 Historical audit value

Timeline rows may contain user-facing messages not yet mirrored in `AuditLog`. Before drop:

- **Option A (preferred):** one-off SQL insert into `audit_logs` from timeline tables (mapping script in migration folder, idempotent).
- **Option B:** keep SQL dump only; accept loss of fine-grained UI history.

`order_composition_replacements` — export if florists rely on replacement history; otherwise actual composition snapshot is source of truth.

`payment_allocation_transfers` — export if finance used cross-order prepayment moves; business process is being removed.

---

## 6. Migration approach

1. **Code first (Stage B/C):** remove all reads/writes to candidate tables in API, backoffice, api-client.
2. **Prisma migration:** new migration file only (never edit applied migrations):

```bash
pnpm --filter @flower/api exec prisma migrate dev --name remove_obsolete_erp_tables --create-only
# Review generated SQL manually
pnpm --filter @flower/api exec prisma validate
pnpm --filter @flower/api db:generate
```

3. **Staging apply:**

```bash
pnpm --filter @flower/api exec prisma migrate deploy
pnpm --filter @flower/api... build
pnpm --filter @flower/backoffice... build
pnpm test
```

4. **Production apply:** manual maintenance window; run same `migrate deploy` after backup.

**Forbidden:**

- `prisma migrate reset`
- `db push --force-reset`
- Editing existing migration files under `apps/api/prisma/migrations/`

---

## 7. Rollback

Prisma migrations are forward-only in production. Rollback = restore database from backup taken in §5.1, then deploy previous application git tag.

```bash
# Restore (example)
psql "$DATABASE_URL" < backup-cleanup-candidates-YYYYMMDD.sql  # data only if needed
# Redeploy previous release
git checkout <previous-tag>
pnpm --filter @flower/api exec prisma migrate deploy  # ensures migration history matches restored DB
```

If migration applied but app not yet deployed: restore full DB snapshot from before `migrate deploy`.

---

## 8. Post-migration verification

Run after staging/production apply:

```sql
-- Deleted tables must not exist
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'delivery_route_plans', 'delivery_route_stops',
    'payment_allocation_transfers', 'order_composition_replacements',
    'order_timeline_events', 'sale_timeline_events',
    'payment_timeline_events', 'delivery_timeline_events',
    'transfer_timeline_events', 'reservation_movements'
  );
-- Expect 0 rows

-- Core invariants smoke check
SELECT COUNT(*) FROM orders;
SELECT COUNT(*) FROM inventory_balances WHERE quantity < 0;  -- expect 0
SELECT COUNT(*) FROM inventory_reservations WHERE status = 'ACTIVE';
```

Application checks:

- Create order → reserve → complete → sale → payment
- Cancel order releases reservation
- Delivery assign → transit → delivered (no route plan)
- Payment on order; refund; no allocation transfer endpoint
- Audit log shows status/payment/write-off events

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @flower/api... build
pnpm --filter @flower/backoffice... build
```

---

## 9. Risk summary

| Risk | Mitigation |
|------|------------|
| Loss of timeline UX history | Optional backfill to `audit_logs`; SQL export |
| Active route plans in production | Audit script + export; deactivate plans before cutover |
| Open reservations with movement ledger | Keep `inventory_reservations`; delete movements only after code path removed |
| Cross-order prepayment transfers | Export + manual settlement before cutover |
| FK migration order | Prisma generates ordered DROP; review SQL |

---

## 10. Stage gate

Proceed with migration only when:

- [ ] Stages A and B complete
- [ ] `audit-removable-data.sql` reviewed on target environment
- [ ] Backup exported
- [ ] All timeline/replacement/route endpoints removed from API and UI
- [ ] Tests green on branch without obsolete tables
