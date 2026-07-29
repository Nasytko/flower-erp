-- Flower ERP — Stage C data audit (SELECT only)
-- Safe to run against staging/production read replicas.
-- Related: docs/database-cleanup-plan.md, docs/cleanup-stage-c-report.md

\set ON_ERROR_STOP on

\echo '=== Stage C removable tables — row counts and date ranges ==='

-- delivery_route_plans
SELECT
  'delivery_route_plans' AS table_name,
  COUNT(*) AS row_count,
  MIN(created_at) AS min_created_at,
  MAX(created_at) AS max_created_at,
  COUNT(DISTINCT organization_id) AS organization_count,
  COUNT(DISTINCT store_id) AS store_count
FROM delivery_route_plans;

-- delivery_route_stops
SELECT
  'delivery_route_stops' AS table_name,
  COUNT(*) AS row_count,
  MIN(created_at) AS min_created_at,
  MAX(created_at) AS max_created_at,
  COUNT(DISTINCT organization_id) AS organization_count,
  NULL::bigint AS store_count
FROM delivery_route_stops;

-- payment_allocation_transfers
SELECT
  'payment_allocation_transfers' AS table_name,
  COUNT(*) AS row_count,
  MIN(created_at) AS min_created_at,
  MAX(created_at) AS max_created_at,
  COUNT(DISTINCT organization_id) AS organization_count,
  NULL::bigint AS store_count
FROM payment_allocation_transfers;

-- order_composition_replacements
SELECT
  'order_composition_replacements' AS table_name,
  COUNT(*) AS row_count,
  MIN(created_at) AS min_created_at,
  MAX(created_at) AS max_created_at,
  COUNT(DISTINCT organization_id) AS organization_count,
  NULL::bigint AS store_count
FROM order_composition_replacements;

-- order_timeline_events
SELECT
  'order_timeline_events' AS table_name,
  COUNT(*) AS row_count,
  MIN(created_at) AS min_created_at,
  MAX(created_at) AS max_created_at,
  COUNT(DISTINCT organization_id) AS organization_count,
  NULL::bigint AS store_count
FROM order_timeline_events;

-- sale_timeline_events
SELECT
  'sale_timeline_events' AS table_name,
  COUNT(*) AS row_count,
  MIN(created_at) AS min_created_at,
  MAX(created_at) AS max_created_at,
  COUNT(DISTINCT organization_id) AS organization_count,
  NULL::bigint AS store_count
FROM sale_timeline_events;

-- payment_timeline_events
SELECT
  'payment_timeline_events' AS table_name,
  COUNT(*) AS row_count,
  MIN(created_at) AS min_created_at,
  MAX(created_at) AS max_created_at,
  COUNT(DISTINCT organization_id) AS organization_count,
  NULL::bigint AS store_count
FROM payment_timeline_events;

-- delivery_timeline_events
SELECT
  'delivery_timeline_events' AS table_name,
  COUNT(*) AS row_count,
  MIN(created_at) AS min_created_at,
  MAX(created_at) AS max_created_at,
  COUNT(DISTINCT organization_id) AS organization_count,
  NULL::bigint AS store_count
FROM delivery_timeline_events;

-- transfer_timeline_events
SELECT
  'transfer_timeline_events' AS table_name,
  COUNT(*) AS row_count,
  MIN(created_at) AS min_created_at,
  MAX(created_at) AS max_created_at,
  COUNT(DISTINCT organization_id) AS organization_count,
  NULL::bigint AS store_count
FROM transfer_timeline_events;

-- reservation_movements
SELECT
  'reservation_movements' AS table_name,
  COUNT(*) AS row_count,
  MIN(created_at) AS min_created_at,
  MAX(created_at) AS max_created_at,
  COUNT(DISTINCT organization_id) AS organization_count,
  COUNT(DISTINCT store_id) AS store_count
FROM reservation_movements;

\echo ''
\echo '=== Enum usage — GIFT_CERTIFICATE ==='

SELECT
  'payment_methods.type = GIFT_CERTIFICATE' AS check_name,
  COUNT(*) AS row_count
FROM payment_methods
WHERE type = 'GIFT_CERTIFICATE';

SELECT
  'payments via GIFT_CERTIFICATE method' AS check_name,
  COUNT(*) AS row_count
FROM payments p
JOIN payment_methods pm ON pm.id = p.method_id
WHERE pm.type = 'GIFT_CERTIFICATE';

\echo ''
\echo '=== Enum usage — SalesChannel.TELEGRAM ==='

SELECT
  'sales.sales_channel = TELEGRAM' AS check_name,
  COUNT(*) AS row_count
FROM sales
WHERE sales_channel = 'TELEGRAM';

\echo ''
\echo '=== Orphan records ==='

-- Route stops without route plan
SELECT
  'delivery_route_stops without route plan' AS check_name,
  COUNT(*) AS orphan_count
FROM delivery_route_stops drs
LEFT JOIN delivery_route_plans drp ON drp.id = drs.route_plan_id
WHERE drp.id IS NULL;

-- Route stops without delivery job
SELECT
  'delivery_route_stops without delivery job' AS check_name,
  COUNT(*) AS orphan_count
FROM delivery_route_stops drs
LEFT JOIN delivery_jobs dj ON dj.id = drs.delivery_job_id
WHERE dj.id IS NULL;

-- Allocation transfers without payment
SELECT
  'payment_allocation_transfers without payment' AS check_name,
  COUNT(*) AS orphan_count
FROM payment_allocation_transfers pat
LEFT JOIN payments p ON p.id = pat.payment_id
WHERE p.id IS NULL;

-- Allocation transfers without from allocation
SELECT
  'payment_allocation_transfers without from allocation' AS check_name,
  COUNT(*) AS orphan_count
FROM payment_allocation_transfers pat
LEFT JOIN payment_allocations pa ON pa.id = pat.from_allocation_id
WHERE pa.id IS NULL;

-- Allocation transfers without to allocation
SELECT
  'payment_allocation_transfers without to allocation' AS check_name,
  COUNT(*) AS orphan_count
FROM payment_allocation_transfers pat
LEFT JOIN payment_allocations pa ON pa.id = pat.to_allocation_id
WHERE pa.id IS NULL;

-- Composition replacements without order
SELECT
  'order_composition_replacements without order' AS check_name,
  COUNT(*) AS orphan_count
FROM order_composition_replacements ocr
LEFT JOIN orders o ON o.id = ocr.order_id
WHERE o.id IS NULL;

-- Order timeline without order
SELECT
  'order_timeline_events without order' AS check_name,
  COUNT(*) AS orphan_count
FROM order_timeline_events te
LEFT JOIN orders o ON o.id = te.order_id
WHERE o.id IS NULL;

-- Sale timeline without sale
SELECT
  'sale_timeline_events without sale' AS check_name,
  COUNT(*) AS orphan_count
FROM sale_timeline_events te
LEFT JOIN sales s ON s.id = te.sale_id
WHERE s.id IS NULL;

-- Payment timeline without payment
SELECT
  'payment_timeline_events without payment' AS check_name,
  COUNT(*) AS orphan_count
FROM payment_timeline_events te
LEFT JOIN payments p ON p.id = te.payment_id
WHERE p.id IS NULL;

-- Delivery timeline without delivery job
SELECT
  'delivery_timeline_events without delivery job' AS check_name,
  COUNT(*) AS orphan_count
FROM delivery_timeline_events te
LEFT JOIN delivery_jobs dj ON dj.id = te.delivery_job_id
WHERE dj.id IS NULL;

-- Transfer timeline without transfer document
SELECT
  'transfer_timeline_events without transfer document' AS check_name,
  COUNT(*) AS orphan_count
FROM transfer_timeline_events te
LEFT JOIN transfer_documents td ON td.id = te.transfer_document_id
WHERE td.id IS NULL;

-- Reservation movements without reservation
SELECT
  'reservation_movements without reservation' AS check_name,
  COUNT(*) AS orphan_count
FROM reservation_movements rm
LEFT JOIN inventory_reservations ir ON ir.id = rm.reservation_id
WHERE ir.id IS NULL;

\echo ''
\echo '=== Stage C audit complete (SELECT only) ==='
