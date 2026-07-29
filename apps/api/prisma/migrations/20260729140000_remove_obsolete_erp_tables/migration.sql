-- Stage C: remove obsolete ERP tables (route planning, timelines, transfers ledger, composition replacements, reservation movements)
-- Prerequisites: run scripts/audit-removable-data.sql and scripts/backup-stage-c-tables.sh before applying to production.

-- Drop child tables first (FK order)
DROP TABLE IF EXISTS "delivery_route_stops";
DROP TABLE IF EXISTS "delivery_route_plans";

DROP TABLE IF EXISTS "payment_allocation_transfers";

DROP TABLE IF EXISTS "order_composition_replacements";

DROP TABLE IF EXISTS "order_timeline_events";
DROP TABLE IF EXISTS "sale_timeline_events";
DROP TABLE IF EXISTS "payment_timeline_events";
DROP TABLE IF EXISTS "delivery_timeline_events";
DROP TABLE IF EXISTS "transfer_timeline_events";

DROP TABLE IF EXISTS "reservation_movements";

-- Drop enums that existed only for removed tables
DROP TYPE IF EXISTS "RoutePlanStatus";
DROP TYPE IF EXISTS "CompositionReplacementReason";
DROP TYPE IF EXISTS "OrderTimelineEventType";
DROP TYPE IF EXISTS "SaleTimelineEventType";
DROP TYPE IF EXISTS "PaymentTimelineEventType";
DROP TYPE IF EXISTS "DeliveryTimelineEventType";
DROP TYPE IF EXISTS "TransferTimelineEventType";
DROP TYPE IF EXISTS "ReservationMovementType";
