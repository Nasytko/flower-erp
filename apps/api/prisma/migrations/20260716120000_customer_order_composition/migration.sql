-- Epic 07: Customer Orders & Floral Composition Engine (ADR-015)

-- New enums
CREATE TYPE "OrderOccasion" AS ENUM ('BIRTHDAY', 'WEDDING', 'ROMANTIC', 'CORPORATE', 'FUNERAL', 'MOTHER_DAY', 'NEW_YEAR', 'OTHER');
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "OrderTimelineEventType" AS ENUM (
  'ORDER_CREATED', 'CONFIRMED', 'RESERVATION_SUCCEEDED', 'RESERVATION_PARTIAL', 'RESERVATION_FAILED',
  'PREPARATION_STARTED', 'COMPOSITION_CHANGED', 'ACTUAL_COMPOSITION_CHANGED', 'READY', 'COMPLETED',
  'CANCELLED', 'ASSIGNMENT_CHANGED', 'COMMENT_ADDED', 'REFERENCE_UPDATED'
);

ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_RESERVED' AFTER 'CONFIRMED';

-- Customers
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "notes" TEXT,
    "preferred_language" TEXT,
    "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customers_organization_id_phone_key" ON "customers"("organization_id", "phone");
CREATE INDEX "customers_organization_id_idx" ON "customers"("organization_id");
CREATE INDEX "customers_organization_id_status_idx" ON "customers"("organization_id", "status");
CREATE INDEX "customers_organization_id_name_idx" ON "customers"("organization_id", "name");

ALTER TABLE "customers" ADD CONSTRAINT "customers_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Extend orders
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "customer_id" UUID;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "occasion" "OrderOccasion" NOT NULL DEFAULT 'OTHER';
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "customer_name_snapshot" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "customer_phone_snapshot" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "reference_url" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "reference_comment" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "planned_price" DECIMAL(18,2);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "assigned_florist_id" UUID;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "created_by_membership_id" UUID;

-- Migrate floristUserId → assigned_florist_id if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'florist_user_id'
  ) THEN
    EXECUTE 'UPDATE orders SET assigned_florist_id = florist_user_id WHERE florist_user_id IS NOT NULL';
    EXECUTE 'ALTER TABLE orders DROP COLUMN florist_user_id';
  END IF;
END $$;

ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "orders_customer_id_idx" ON "orders"("customer_id");
CREATE INDEX IF NOT EXISTS "orders_assigned_florist_id_idx" ON "orders"("assigned_florist_id");

-- Planned composition
CREATE TABLE "order_compositions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "order_compositions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "order_compositions_order_id_key" ON "order_compositions"("order_id");
CREATE INDEX "order_compositions_organization_id_idx" ON "order_compositions"("organization_id");

ALTER TABLE "order_compositions" ADD CONSTRAINT "order_compositions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_compositions" ADD CONSTRAINT "order_compositions_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "order_composition_items" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "composition_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "planned_quantity" DECIMAL(18,3) NOT NULL,
    "comment" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "order_composition_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "order_composition_items_planned_quantity_check" CHECK ("planned_quantity" > 0)
);

CREATE UNIQUE INDEX "order_composition_items_composition_id_item_id_key" ON "order_composition_items"("composition_id", "item_id");
CREATE INDEX "order_composition_items_organization_id_idx" ON "order_composition_items"("organization_id");
CREATE INDEX "order_composition_items_composition_id_idx" ON "order_composition_items"("composition_id");
CREATE INDEX "order_composition_items_item_id_idx" ON "order_composition_items"("item_id");

ALTER TABLE "order_composition_items" ADD CONSTRAINT "order_composition_items_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_composition_items" ADD CONSTRAINT "order_composition_items_composition_id_fkey"
  FOREIGN KEY ("composition_id") REFERENCES "order_compositions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_composition_items" ADD CONSTRAINT "order_composition_items_item_id_fkey"
  FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Migrate legacy order_items → composition (preserve ids for reservation FKs)
INSERT INTO "order_compositions" ("id", "organization_id", "order_id", "created_at", "updated_at")
SELECT gen_random_uuid(), o."organization_id", o."id", NOW(), NOW()
FROM "orders" o
WHERE NOT EXISTS (SELECT 1 FROM "order_compositions" c WHERE c."order_id" = o."id");

INSERT INTO "order_composition_items" (
  "id", "organization_id", "composition_id", "item_id", "planned_quantity", "comment", "sort_order", "created_at", "updated_at"
)
SELECT oi."id", oi."organization_id", c."id", oi."item_id", oi."quantity", oi."comment", 0, oi."created_at", NOW()
FROM "order_items" oi
JOIN "order_compositions" c ON c."order_id" = oi."order_id"
ON CONFLICT DO NOTHING;

DROP TABLE IF EXISTS "order_items";

-- Actual composition
CREATE TABLE "actual_compositions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "frozen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "actual_compositions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "actual_compositions_order_id_key" ON "actual_compositions"("order_id");
CREATE INDEX "actual_compositions_organization_id_idx" ON "actual_compositions"("organization_id");

ALTER TABLE "actual_compositions" ADD CONSTRAINT "actual_compositions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "actual_compositions" ADD CONSTRAINT "actual_compositions_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "actual_composition_items" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "composition_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "actual_quantity" DECIMAL(18,3) NOT NULL,
    "batch_id" UUID,
    "comment" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "actual_composition_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "actual_composition_items_actual_quantity_check" CHECK ("actual_quantity" > 0)
);

CREATE INDEX "actual_composition_items_organization_id_idx" ON "actual_composition_items"("organization_id");
CREATE INDEX "actual_composition_items_composition_id_idx" ON "actual_composition_items"("composition_id");
CREATE INDEX "actual_composition_items_item_id_idx" ON "actual_composition_items"("item_id");

ALTER TABLE "actual_composition_items" ADD CONSTRAINT "actual_composition_items_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "actual_composition_items" ADD CONSTRAINT "actual_composition_items_composition_id_fkey"
  FOREIGN KEY ("composition_id") REFERENCES "actual_compositions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "actual_composition_items" ADD CONSTRAINT "actual_composition_items_item_id_fkey"
  FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Assignments
CREATE TABLE "order_assignments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL,
    "released_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "order_assignments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "order_assignments_organization_id_idx" ON "order_assignments"("organization_id");
CREATE INDEX "order_assignments_order_id_idx" ON "order_assignments"("order_id");
CREATE INDEX "order_assignments_membership_id_idx" ON "order_assignments"("membership_id");
CREATE INDEX "order_assignments_order_id_released_at_idx" ON "order_assignments"("order_id", "released_at");
CREATE UNIQUE INDEX "order_assignments_one_active_per_order"
  ON "order_assignments"("order_id") WHERE "released_at" IS NULL;

ALTER TABLE "order_assignments" ADD CONSTRAINT "order_assignments_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_assignments" ADD CONSTRAINT "order_assignments_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Timeline
CREATE TABLE "order_timeline_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "type" "OrderTimelineEventType" NOT NULL,
    "message" TEXT,
    "actor_membership_id" UUID,
    "payload" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "order_timeline_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "order_timeline_events_organization_id_idx" ON "order_timeline_events"("organization_id");
CREATE INDEX "order_timeline_events_order_id_occurred_at_idx" ON "order_timeline_events"("order_id", "occurred_at");

ALTER TABLE "order_timeline_events" ADD CONSTRAINT "order_timeline_events_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_timeline_events" ADD CONSTRAINT "order_timeline_events_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Comments
CREATE TABLE "order_comments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "author_membership_id" UUID NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "order_comments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "order_comments_organization_id_idx" ON "order_comments"("organization_id");
CREATE INDEX "order_comments_order_id_created_at_idx" ON "order_comments"("order_id", "created_at");

ALTER TABLE "order_comments" ADD CONSTRAINT "order_comments_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_comments" ADD CONSTRAINT "order_comments_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Permissions seed
INSERT INTO "permissions" ("id", "code", "description") VALUES
  (gen_random_uuid(), 'customers:read', 'View customers'),
  (gen_random_uuid(), 'customers:manage', 'Create and archive customers'),
  (gen_random_uuid(), 'orders:update', 'Update draft and order commercial fields'),
  (gen_random_uuid(), 'orders:assign', 'Assign florists to orders'),
  (gen_random_uuid(), 'orders:prepare', 'Start preparation, edit actual composition, mark ready')
ON CONFLICT ("code") DO NOTHING;
