# Domain Flow: Delivery

**Status:** Accepted  
**Module:** `delivery`  
**ADRs:** 027–031

## Responsibility

Plan and execute courier/taxi/third-party delivery for Orders with fulfillment `DELIVERY`.

## Not responsible

Sale posting, payments, inventory, route optimization, courier-only auth.

## Core entities

DeliveryJob, DeliveryAddressSnapshot (embedded or related), DeliveryAssignment, DeliveryTimelineEvent, DeliveryProblem, CourierProfile, DeliveryRoutePlan, DeliveryRouteStop.

## Ports

| Port | Direction |
|------|-----------|
| OrdersDeliveryPort | Order snapshot, fulfillment, READY check, timeline |
| PaymentsDeliveryReadPort | Payment summary for handover |
| DeliveryReadinessPort | Order MarkReady → sync READY_FOR_DISPATCH eligibility |
| GeocodingPort | search/geocode/reverse (manual/mock in v1) |
| RoutingPort | external navigation URL (v1); no optimize |

## Lifecycle (summary)

Create/plan → address/coords → assign courier → Order READY → ready-for-dispatch/handover → in transit → delivered | problem | cancelled.
