# ADR-027: Delivery belongs to Order fulfillment

**Status:** Accepted  
**Date:** 2026-07-17  

## Decision

- Delivery is a separate bounded context from Order, Sale, and Payment.
- A DeliveryJob executes fulfillment of an Order with type `DELIVERY`.
- Delivery does not create Sale or Payment; it only reads readiness and payment summary via ports.
- At most one **active** DeliveryJob per Order (cancelled jobs remain as history).

## Consequences

Cross-module access only via `OrdersDeliveryPort`, `PaymentsDeliveryReadPort`, `DeliveryReadinessPort`. No Prisma into foreign tables from delivery write path.
