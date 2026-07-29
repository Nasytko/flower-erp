# Flower ERP — Stage B Cleanup Report

**Status:** Stage B complete (dead UI/backend removed; schema unchanged)  
**Date:** 2026-07-29  
**Baseline:** `main` @ `5c2b4f1`

Related: [cleanup-audit.md](./cleanup-audit.md), [database-cleanup-plan.md](./database-cleanup-plan.md)

---

## 1. Summary

Stage B removed premature and dead vertical slices from backoffice and API without Prisma schema changes, destructive migrations, or changes to core inventory/order/sale/payment business logic.

| Area | Outcome |
|------|---------|
| Navigation | Simplified to staff + admin IA per spec |
| «Сегодня» | Consolidated into `TodayWorkspaceView` at `/today` |
| Route planning | UI + API endpoints removed; `DeliveryJob` flows kept |
| Timelines (admin) | GET timeline endpoints + UI panels removed |
| Payment allocation transfer | User API + UI removed |
| Composition replacement workflow | User API + work-order UI removed |
| Orphan pages | `sessions`, `delivery-routes/*` deleted |
| Permissions | `delivery:manage-routes` removed |
| Builds | lint, typecheck, test, API + backoffice production build — pass |

---

## 2. «Сегодня» decision

**Chosen screen:** former `home/page.tsx` workspace → extracted to `TodayWorkspaceView`.

| Route | Behavior |
|-------|----------|
| `/today` | Real workspace (`TodayWorkspaceView`) — orders today, overdue, assembly, ready, payments, deliveries, KPI |
| `/home` | Redirect → `/today` |
| `/operations` | Redirect → `/reports` |
| `/orders/calendar` | Order calendar board (separate nav item «Заказы») |

No cyclic redirects. Duplicate dashboards removed; calendar kept as order-focused view.

---

## 3. Navigation (Stage B IA)

### Primary (staff)

Сегодня · Заказы · Продажа · Клиенты · Остатки · Поступления · Списания · Инвентаризация · Отчёты · Настройки

### Admin (director/owner)

Сотрудники · Магазины · Склады · Перемещения · Касса · Аудит

### Hidden from main menu (routes may still exist for deep links)

Organizations picker, integrations, master-data sub-routes, couriers (via settings/delivery), reservation movements, payment allocations, route plans, timeline admin, sessions.

---

## 4. Deleted pages / routes (UI)

| Route | Reason |
|-------|--------|
| `app/sessions/page.tsx` | Orphan; no business scenario |
| `stores/.../delivery-routes` | Multi-stop route planning |
| `stores/.../delivery-routes/[routeId]` | Route plan editor |

### Simplified (sections removed, page kept)

| Page | Removed |
|------|---------|
| `sales/[saleId]` | «Перенести предоплату», timeline «История» |
| `sales/new` | `allocateOrderPrepaymentsToSale` on complete |
| `payments/[paymentId]` | Timeline panel |
| `transfers/[transferId]` | Timeline card |
| `work-orders/[orderId]` | Composition replacement form |
| `deliveries/[deliveryId]` | Timeline fetch; uses `summary.openProblems` |
| `payment-methods` | `GIFT_CERTIFICATE` from create-type list (Stage C enum) |

---

## 5. Added / refactored UI files

| File | Purpose |
|------|---------|
| `src/components/order/order-calendar-view.tsx` | Extracted from calendar page (Next.js build fix) |
| `src/components/workspace/today-workspace-view.tsx` | Main «Сегодня» workspace |
| `stores/.../reports/page.tsx` | Simple reports hub (operations KPI + director panel) |
| `src/lib/nav.ts` | Stage B navigation |
| `src/components/shell/sidebar-nav.tsx`, `nav-icons.tsx` | Admin section + icons |

---

## 6. Deleted API endpoints

### Delivery route planning (controller)

- `GET/POST delivery-routes`
- `GET delivery-routes/:routeId`
- `POST delivery-routes/:routeId/stops`
- `POST delivery-routes/:routeId/stops/reorder`
- `POST delivery-routes/:routeId/activate|complete|cancel`

### Entity timeline (read-only admin)

- `GET orders/:id/timeline`
- `GET sales/:id/timeline`
- `GET payments/:id/timeline`
- `GET deliveries/:id/timeline`
- `GET transfers/:id/timeline`

### Payment allocation transfer

- `POST orders/:id/allocate-prepayments-to-sale`

### Composition replacement

- `POST orders/:id/composition/replacements`

**Note:** Backend may still **write** timeline events and reservation movements internally — Stage C drops tables.

---

## 7. Deleted backend files / services

| File | Reason |
|------|--------|
| `delivery/infrastructure/external-navigation-link.adapter.ts` | Multi-stop routing only |
| `delivery/infrastructure/external-navigation-link.adapter.test.ts` | |
| `delivery/application/ports/routing.port.ts` | Route planning port |

### Trimmed (methods removed, file kept)

- `delivery.use-cases.ts` — route plan use cases
- `delivery.repository.ts` + `prisma-delivery.repository.ts` — route plan CRUD
- `delivery.presenter.ts` — `presentRoute()`
- `delivery.module.ts` — `ROUTING_PORT` registration
- `delivery.controller.ts` — route + timeline GET handlers

### Internal use cases retained (not exposed via HTTP)

- `order.use-cases.replaceCompositionItem` — dead code candidate for Stage C
- `payment.use-cases.allocateOrderPrepaymentsToSale` — dead code candidate for Stage C

---

## 8. Delivery — what is kept

| Capability | Status |
|------------|--------|
| Delivery list / board | KEEP (`delivery-board`) |
| Delivery calendar | KEEP (`delivery-calendar`) |
| Delivery map | KEEP (`delivery-map`) |
| Delivery detail + summary | KEEP |
| Courier assign/reassign/release | KEEP |
| Status transitions | KEEP |
| Geocoding / coordinates / address | KEEP |
| DeliveryProblem report/resolve | KEEP |
| Couriers CRUD | KEEP |
| Yandex geocoding config | KEEP |

---

## 9. api-client — removed types/methods

- `DeliveryRoutePlanDto`, `DeliveryRouteStopDto`, route CRUD methods
- `*TimelineDto`, `getOrderTimeline`, `getSaleTimeline`, `getPaymentTimeline`, `getDeliveryTimeline`, `getTransferTimeline`
- `CompositionReplaceReason`, `replaceCompositionItem`
- `allocateOrderPrepaymentsToSale`
- Added: `DeliverySummaryDto.openProblems`, `listOpenProblems` via summary

---

## 10. Permissions

| Change | Detail |
|--------|--------|
| Removed | `delivery:manage-routes` |
| Count | 72 permissions (was 73) |
| Role presets | Updated in registry (director/florist/courier unchanged for delivery ops) |

---

## 11. NEEDS_REVIEW decisions (Stage B)

| Item | Decision |
|------|----------|
| CashShift | Not added; keep `CashAccount` / `CashOperation` |
| Reports | Simple `/reports` route; no new backend module |
| UnitOfMeasure | Model kept; no admin UI required |
| Delivery map/calendar/board | KEEP (DeliveryJob-based) |
| DeliveryProblem | KEEP; no workflow expansion |
| Recipient | Order snapshot fields; no new entity |
| GIFT_CERTIFICATE | Removed from payment-method create UI; enum → Stage C |
| SalesChannel.TELEGRAM | No runtime integration; label in status map only; enum → Stage C |

---

## 12. Dependencies

No npm packages removed in Stage B — route planning used no dedicated external deps beyond existing geocoding.

`dependency-cruiser`: 6 pre-existing violations (domain/application importing Prisma in inventory/orders). Not introduced by Stage B; not masked.

---

## 13. Verification results

| Check | Result |
|-------|--------|
| `pnpm lint` | Pass |
| `pnpm typecheck` | Pass |
| `pnpm test` | Pass (84 api unit; e2e/integration skipped without DB) |
| `pnpm --filter @flower/api db:generate` | Pass |
| `pnpm prisma:validate` | Pass |
| `pnpm --filter @flower/contracts... build` | Pass |
| `pnpm --filter @flower/api-client... build` | Pass |
| `pnpm --filter @flower/api... build` | Pass |
| `pnpm --filter @flower/backoffice... build` | Pass |
| `pnpm depcruise` | Fail — 6 existing architecture violations (unchanged) |

---

## 14. Known issues / deferred

1. **`scripts/audit-removable-data.sql`** — referenced in Stage A docs but not present in repo; recreate in Stage C prep if needed.
2. **Timeline write paths** — internal posting to `*_timeline_events` continues until Stage C migration.
3. **Dead internal use cases** — `replaceCompositionItem`, `allocateOrderPrepaymentsToSale` in application layer without HTTP exposure.
4. **Route DTO remnants** — `RoutePlanStatus` in `delivery.dto.ts` / `delivery-rules.ts` (unused by endpoints; safe cleanup in Stage C).
5. **`fancy-select.tsx`** — still handles `GIFT_CERTIFICATE` display for existing records.
6. **Integrations page** — exists at org level, hidden from store nav (intentional).

---

## 15. Stage C — proposed Prisma model / table deletion

Do **not** execute until user approves after A+B review.

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

### Stage C — enum value removal (after data audit)

- `PaymentMethodType.GIFT_CERTIFICATE`
- `SalesChannel.TELEGRAM`

---

## 16. Git commits (Stage B)

1. `fix(backoffice): extract order calendar view`
2. `docs: add cleanup dependency audit`
3. `refactor(backoffice): simplify primary navigation`
4. `refactor(backoffice): consolidate today workspace`
5. `remove(backoffice): delete delivery route planning UI`
6. `remove(api): delete unused route planning endpoints`
7. `remove(backoffice): delete dead and orphan pages`
8. `remove: clean unused contracts and permissions`
9. `chore: remove dead code and dependencies`
10. `test: update checks after stage b cleanup`

---

## 17. File change inventory (git)

### Modified (34 tracked)

See `git diff --stat` @ Stage B completion: **−3169 / +274** lines across API, backoffice, api-client, permissions.

### Added (untracked → committed)

- `docs/cleanup-audit.md`
- `docs/database-cleanup-plan.md`
- `docs/cleanup-stage-b-report.md`
- `apps/backoffice/src/components/order/order-calendar-view.tsx`
- `apps/backoffice/src/components/workspace/today-workspace-view.tsx`
- `apps/backoffice/app/.../reports/page.tsx`

### Deleted

- `apps/backoffice/app/sessions/page.tsx`
- `apps/backoffice/app/.../delivery-routes/page.tsx`
- `apps/backoffice/app/.../delivery-routes/[routeId]/page.tsx`
- `apps/api/src/modules/delivery/infrastructure/external-navigation-link.adapter.ts`
- `apps/api/src/modules/delivery/infrastructure/external-navigation-link.adapter.test.ts`
- `apps/api/src/modules/delivery/application/ports/routing.port.ts`
