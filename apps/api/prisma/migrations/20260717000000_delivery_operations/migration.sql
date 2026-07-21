-- EPIC 11: Delivery operations (ADR-027–031)

ALTER TYPE "OrderTimelineEventType" ADD VALUE IF NOT EXISTS 'DELIVERY_CREATED';
ALTER TYPE "OrderTimelineEventType" ADD VALUE IF NOT EXISTS 'DELIVERY_COMPLETED';
ALTER TYPE "OrderTimelineEventType" ADD VALUE IF NOT EXISTS 'DELIVERY_CANCELLED';

CREATE TYPE "DeliveryStatus" AS ENUM (
  'DRAFT', 'PLANNED', 'READY_FOR_DISPATCH', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'PROBLEM', 'CANCELLED'
);
CREATE TYPE "DeliveryMethod" AS ENUM ('OWN_COURIER', 'TAXI', 'THIRD_PARTY_SERVICE');
CREATE TYPE "GeocodingStatus" AS ENUM ('NOT_REQUESTED', 'PENDING', 'RESOLVED', 'FAILED', 'MANUAL');
CREATE TYPE "AddressSource" AS ENUM ('MANUAL', 'GEOCODED', 'USER_PIN');
CREATE TYPE "CourierStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');
CREATE TYPE "DeliveryProblemType" AS ENUM (
  'RECIPIENT_UNAVAILABLE', 'WRONG_ADDRESS', 'DELAY', 'DAMAGED_ORDER', 'PAYMENT_ISSUE', 'COURIER_ISSUE', 'OTHER'
);
CREATE TYPE "DeliveryProblemStatus" AS ENUM ('OPEN', 'RESOLVED', 'CANCELLED');
CREATE TYPE "DeliveryTimelineEventType" AS ENUM (
  'DELIVERY_CREATED', 'DELIVERY_PLANNED', 'ADDRESS_UPDATED', 'COORDINATES_RESOLVED', 'COORDINATES_SET_MANUALLY',
  'COURIER_ASSIGNED', 'COURIER_REASSIGNED', 'COURIER_RELEASED', 'READY_FOR_DISPATCH', 'HANDED_OVER', 'IN_TRANSIT',
  'PROBLEM_REPORTED', 'PROBLEM_RESOLVED', 'DELIVERED', 'CANCELLED', 'ROUTE_ASSIGNED', 'ROUTE_ORDER_CHANGED'
);
CREATE TYPE "RoutePlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED');

CREATE TABLE "courier_profiles" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "membership_id" UUID NOT NULL,
  "display_name_snapshot" TEXT NOT NULL,
  "phone_snapshot" TEXT,
  "status" "CourierStatus" NOT NULL DEFAULT 'ACTIVE',
  "vehicle_type" TEXT,
  "vehicle_description" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "courier_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "delivery_jobs" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "number" TEXT NOT NULL,
  "status" "DeliveryStatus" NOT NULL DEFAULT 'DRAFT',
  "method" "DeliveryMethod" NOT NULL,
  "delivery_date" DATE NOT NULL,
  "window_start" TIMESTAMP(3) NOT NULL,
  "window_end" TIMESTAMP(3) NOT NULL,
  "required_dispatch_at" TIMESTAMP(3),
  "recipient_name" TEXT NOT NULL,
  "recipient_phone" TEXT NOT NULL,
  "display_address" TEXT NOT NULL,
  "address_line" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "postal_code" TEXT,
  "entrance" TEXT,
  "floor" TEXT,
  "apartment" TEXT,
  "access_code" TEXT,
  "delivery_comment" TEXT,
  "latitude" DECIMAL(10,7),
  "longitude" DECIMAL(10,7),
  "geocoding_status" "GeocodingStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
  "address_source" "AddressSource",
  "delivery_fee" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "currency_code" CHAR(3) NOT NULL DEFAULT 'BYN',
  "assigned_courier_id" UUID,
  "external_reference" TEXT,
  "provider_name" TEXT,
  "handed_over_at" TIMESTAMP(3),
  "departed_at" TIMESTAMP(3),
  "delivered_at" TIMESTAMP(3),
  "cancelled_at" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_by_membership_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "delivery_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "delivery_jobs_fee_non_negative" CHECK ("delivery_fee" >= 0),
  CONSTRAINT "delivery_jobs_window_valid" CHECK ("window_end" >= "window_start")
);

CREATE TABLE "delivery_assignments" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "delivery_job_id" UUID NOT NULL,
  "courier_profile_id" UUID NOT NULL,
  "assigned_by_membership_id" UUID,
  "assigned_at" TIMESTAMP(3) NOT NULL,
  "released_at" TIMESTAMP(3),
  "release_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "delivery_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "delivery_problems" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "delivery_job_id" UUID NOT NULL,
  "type" "DeliveryProblemType" NOT NULL,
  "description" TEXT NOT NULL,
  "status" "DeliveryProblemStatus" NOT NULL DEFAULT 'OPEN',
  "reported_by_membership_id" UUID,
  "reported_at" TIMESTAMP(3) NOT NULL,
  "resolved_by_membership_id" UUID,
  "resolved_at" TIMESTAMP(3),
  "resolution" TEXT,
  "resolve_to_status" "DeliveryStatus",
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "delivery_problems_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "delivery_timeline_events" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "delivery_job_id" UUID NOT NULL,
  "type" "DeliveryTimelineEventType" NOT NULL,
  "message" TEXT,
  "actor_membership_id" UUID,
  "payload" JSONB,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "delivery_timeline_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "delivery_route_plans" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "service_date" DATE NOT NULL,
  "courier_profile_id" UUID,
  "name" TEXT NOT NULL,
  "status" "RoutePlanStatus" NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_by_membership_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "delivery_route_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "delivery_route_stops" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "route_plan_id" UUID NOT NULL,
  "delivery_job_id" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "planned_arrival_at" TIMESTAMP(3),
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "delivery_route_stops_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "courier_profiles_organization_id_membership_id_key"
  ON "courier_profiles"("organization_id", "membership_id");
CREATE INDEX "courier_profiles_organization_id_status_idx"
  ON "courier_profiles"("organization_id", "status");

CREATE UNIQUE INDEX "delivery_jobs_organization_id_number_key"
  ON "delivery_jobs"("organization_id", "number");
CREATE UNIQUE INDEX "delivery_jobs_one_active_per_order"
  ON "delivery_jobs"("order_id") WHERE "status" <> 'CANCELLED';
CREATE INDEX "delivery_jobs_organization_id_idx" ON "delivery_jobs"("organization_id");
CREATE INDEX "delivery_jobs_organization_id_store_id_idx" ON "delivery_jobs"("organization_id", "store_id");
CREATE INDEX "delivery_jobs_organization_id_store_id_status_idx"
  ON "delivery_jobs"("organization_id", "store_id", "status");
CREATE INDEX "delivery_jobs_organization_id_store_id_delivery_date_idx"
  ON "delivery_jobs"("organization_id", "store_id", "delivery_date");
CREATE INDEX "delivery_jobs_organization_id_assigned_courier_id_idx"
  ON "delivery_jobs"("organization_id", "assigned_courier_id");
CREATE INDEX "delivery_jobs_organization_id_store_id_window_start_idx"
  ON "delivery_jobs"("organization_id", "store_id", "window_start");
CREATE INDEX "delivery_jobs_organization_id_store_id_required_dispatch_at_idx"
  ON "delivery_jobs"("organization_id", "store_id", "required_dispatch_at");
CREATE INDEX "delivery_jobs_order_id_idx" ON "delivery_jobs"("order_id");
CREATE INDEX "delivery_jobs_has_coordinates_idx"
  ON "delivery_jobs"("organization_id", "store_id")
  WHERE "latitude" IS NOT NULL AND "longitude" IS NOT NULL;

CREATE UNIQUE INDEX "delivery_assignments_one_active_per_job"
  ON "delivery_assignments"("delivery_job_id") WHERE "released_at" IS NULL;
CREATE INDEX "delivery_assignments_organization_id_idx" ON "delivery_assignments"("organization_id");
CREATE INDEX "delivery_assignments_delivery_job_id_idx" ON "delivery_assignments"("delivery_job_id");
CREATE INDEX "delivery_assignments_courier_profile_id_idx" ON "delivery_assignments"("courier_profile_id");

CREATE INDEX "delivery_problems_organization_id_idx" ON "delivery_problems"("organization_id");
CREATE INDEX "delivery_problems_delivery_job_id_status_idx" ON "delivery_problems"("delivery_job_id", "status");

CREATE INDEX "delivery_timeline_events_organization_id_idx" ON "delivery_timeline_events"("organization_id");
CREATE INDEX "delivery_timeline_events_delivery_job_id_occurred_at_idx"
  ON "delivery_timeline_events"("delivery_job_id", "occurred_at");

CREATE INDEX "delivery_route_plans_organization_id_store_id_service_date_idx"
  ON "delivery_route_plans"("organization_id", "store_id", "service_date");
CREATE INDEX "delivery_route_plans_organization_id_store_id_status_idx"
  ON "delivery_route_plans"("organization_id", "store_id", "status");
CREATE INDEX "delivery_route_plans_courier_profile_id_idx" ON "delivery_route_plans"("courier_profile_id");

CREATE UNIQUE INDEX "delivery_route_stops_route_plan_id_sequence_key"
  ON "delivery_route_stops"("route_plan_id", "sequence");
CREATE INDEX "delivery_route_stops_organization_id_idx" ON "delivery_route_stops"("organization_id");
CREATE INDEX "delivery_route_stops_delivery_job_id_idx" ON "delivery_route_stops"("delivery_job_id");
-- Active-stop uniqueness (one stop per job on DRAFT/ACTIVE plans) enforced in application layer.

ALTER TABLE "courier_profiles"
  ADD CONSTRAINT "courier_profiles_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "delivery_jobs"
  ADD CONSTRAINT "delivery_jobs_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_jobs"
  ADD CONSTRAINT "delivery_jobs_store_id_fkey"
  FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_jobs"
  ADD CONSTRAINT "delivery_jobs_assigned_courier_id_fkey"
  FOREIGN KEY ("assigned_courier_id") REFERENCES "courier_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "delivery_assignments"
  ADD CONSTRAINT "delivery_assignments_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_assignments"
  ADD CONSTRAINT "delivery_assignments_delivery_job_id_fkey"
  FOREIGN KEY ("delivery_job_id") REFERENCES "delivery_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_assignments"
  ADD CONSTRAINT "delivery_assignments_courier_profile_id_fkey"
  FOREIGN KEY ("courier_profile_id") REFERENCES "courier_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "delivery_problems"
  ADD CONSTRAINT "delivery_problems_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_problems"
  ADD CONSTRAINT "delivery_problems_delivery_job_id_fkey"
  FOREIGN KEY ("delivery_job_id") REFERENCES "delivery_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "delivery_timeline_events"
  ADD CONSTRAINT "delivery_timeline_events_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_timeline_events"
  ADD CONSTRAINT "delivery_timeline_events_delivery_job_id_fkey"
  FOREIGN KEY ("delivery_job_id") REFERENCES "delivery_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "delivery_route_plans"
  ADD CONSTRAINT "delivery_route_plans_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_route_plans"
  ADD CONSTRAINT "delivery_route_plans_store_id_fkey"
  FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_route_plans"
  ADD CONSTRAINT "delivery_route_plans_courier_profile_id_fkey"
  FOREIGN KEY ("courier_profile_id") REFERENCES "courier_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "delivery_route_stops"
  ADD CONSTRAINT "delivery_route_stops_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_route_stops"
  ADD CONSTRAINT "delivery_route_stops_route_plan_id_fkey"
  FOREIGN KEY ("route_plan_id") REFERENCES "delivery_route_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_route_stops"
  ADD CONSTRAINT "delivery_route_stops_delivery_job_id_fkey"
  FOREIGN KEY ("delivery_job_id") REFERENCES "delivery_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "code", "description")
SELECT gen_random_uuid(), p.code, p.description
FROM (VALUES
  ('delivery:read', 'View deliveries, board, map, and calendar'),
  ('delivery:create', 'Create delivery jobs from orders'),
  ('delivery:update', 'Plan deliveries and update address/coordinates'),
  ('delivery:assign', 'Assign, reassign, and release couriers'),
  ('delivery:dispatch', 'Mark ready for dispatch, handover, and start transit'),
  ('delivery:complete', 'Mark deliveries as delivered'),
  ('delivery:cancel', 'Cancel delivery jobs'),
  ('delivery:report-problem', 'Report delivery problems'),
  ('delivery:resolve-problem', 'Resolve delivery problems'),
  ('delivery:manage-couriers', 'Create and archive courier profiles'),
  ('delivery:manage-routes', 'Create and manage delivery route plans'),
  ('delivery:view-payment-summary', 'View payment balance on delivery summary')
) AS p(code, description)
ON CONFLICT ("code") DO NOTHING;

-- DIRECTOR: all delivery permissions
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r.code = 'DIRECTOR' AND r."is_system" = true
  AND p.code LIKE 'delivery:%'
ON CONFLICT DO NOTHING;

-- FLORIST: read, create, update, dispatch, report-problem
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r.code = 'FLORIST' AND r."is_system" = true
  AND p.code IN (
    'delivery:read', 'delivery:create', 'delivery:update',
    'delivery:dispatch', 'delivery:report-problem'
  )
ON CONFLICT DO NOTHING;

-- Ensure COURIER system role exists per organization (idempotent)
INSERT INTO "roles" ("id", "organization_id", "name", "code", "is_system", "status", "created_at", "updated_at")
SELECT gen_random_uuid(), o.id, 'Courier', 'COURIER', true, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "organizations" o
WHERE NOT EXISTS (
  SELECT 1 FROM "roles" r WHERE r."organization_id" = o.id AND r.code = 'COURIER'
);

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r.code = 'COURIER' AND r."is_system" = true
  AND p.code IN (
    'organization:read', 'stores:read',
    'delivery:read', 'delivery:dispatch', 'delivery:complete', 'delivery:report-problem'
  )
ON CONFLICT DO NOTHING;
