# Domain Flow: Order (Customer Order & Composition)

**Status:** Accepted  
**Module:** `orders`  
**ADR:** [015](../architecture/adr/015-customer-order-composition-engine.md) (status/reservation; extends [014](../architecture/adr/014-order-status-and-reservation.md))

## Responsibility

Represent a **customer obligation** and **florist production document**: planned composition, reservation outcome, assignment, actual composition. Not Sale, Payment, or Delivery.

## Boundaries

- Thin `Customer` owned by orders (not CRM).
- Inventory writes only via `InventoryReservationPort`.
- No Batch / Balance / Warehouse repository imports in orders.

## Main entities

| Entity | Role |
|--------|------|
| `Customer` | Org-scoped contact; phone unique; archive |
| `Order` | Header + snapshots + occasion + reference + planned price |
| `OrderComposition` / `OrderCompositionItem` | Planned floral lines |
| `ActualComposition` / `ActualCompositionItem` | What florist actually assembled |
| `OrderAssignment` | Single active florist membership |
| `OrderTimelineEvent` | Append-only business timeline |
| `OrderComment` | Staff comments (≠ timeline) |

Required ids: `organizationId`, `storeId`, `warehouseId` (fulfillment warehouse for reserve).

## Statuses (binding)

`DRAFT` → `CONFIRMED` → `PARTIALLY_RESERVED` \| `RESERVED` → `IN_PREPARATION` → `READY` → `COMPLETED`  
`CANCELLED` from non-`COMPLETED`.

## Commands

| Command | Effect |
|---------|--------|
| Customer CRUD / archive | Thin customer |
| CreateOrder / UpdateDraft | Header + reference |
| Upsert planned composition | Draft (and re-edit rules) |
| ConfirmOrder | Attempt reserve → CONFIRMED / PARTIAL / RESERVED |
| ReserveOrder | Retry reserve |
| AssignFlorist / ReleaseAssignment | One active |
| StartPreparation | Requires assignment; seed actual from planned |
| UpdateActualComposition | Until READY |
| MarkReady | Freeze actual; no stock issue; optional DeliveryReadinessPort sync |

Fulfillment: `Order.type` is `PICKUP` | `DELIVERY` (ADR-028). Changing type on draft calls `DeliveryFulfillmentPort`. Creating DeliveryJob requires `type=DELIVERY` (see [delivery-flow.md](./delivery-flow.md)).

## Deferred

File references / CRM merge. Sale and Payment are implemented (separate modules). Delivery operations are implemented in `delivery` module (ADR-027–031).
