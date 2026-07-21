-- EPIC 10: workspace read models + actual composition optimistic concurrency

-- Order.version (ADR-024)
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;

-- Timeline: structured composition replacement event
ALTER TYPE "OrderTimelineEventType" ADD VALUE IF NOT EXISTS 'COMPOSITION_REPLACED';

-- Replacement reason enum + table (owned by orders)
CREATE TYPE "CompositionReplacementReason" AS ENUM (
  'OUT_OF_STOCK',
  'QUALITY',
  'CUSTOMER_REQUEST',
  'FLORIST_DECISION',
  'OTHER'
);

CREATE TABLE "order_composition_replacements" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "from_item_id" UUID NOT NULL,
    "to_item_id" UUID NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "reason" "CompositionReplacementReason" NOT NULL,
    "comment" TEXT,
    "actor_membership_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "order_composition_replacements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "order_composition_replacements_organization_id_idx"
  ON "order_composition_replacements"("organization_id");
CREATE INDEX "order_composition_replacements_order_id_created_at_idx"
  ON "order_composition_replacements"("order_id", "created_at");
CREATE INDEX "order_composition_replacements_from_item_id_idx"
  ON "order_composition_replacements"("from_item_id");
CREATE INDEX "order_composition_replacements_to_item_id_idx"
  ON "order_composition_replacements"("to_item_id");

ALTER TABLE "order_composition_replacements"
  ADD CONSTRAINT "order_composition_replacements_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_composition_replacements"
  ADD CONSTRAINT "order_composition_replacements_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_composition_replacements"
  ADD CONSTRAINT "order_composition_replacements_from_item_id_fkey"
  FOREIGN KEY ("from_item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_composition_replacements"
  ADD CONSTRAINT "order_composition_replacements_to_item_id_fkey"
  FOREIGN KEY ("to_item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One active assignment per order (idempotent if already created in earlier migration)
CREATE UNIQUE INDEX IF NOT EXISTS "order_assignments_one_active_per_order"
  ON "order_assignments"("order_id") WHERE "released_at" IS NULL;

-- Workspace / operations permissions
INSERT INTO "permissions" ("id", "code", "description")
SELECT gen_random_uuid(), p.code, p.description
FROM (VALUES
  ('workspace:read', 'View florist Today workspace and work-order projections'),
  ('operations:read', 'View director Operations attention board and KPIs')
) AS p(code, description)
ON CONFLICT ("code") DO NOTHING;

-- Grant to system roles (DIRECTOR gets both; FLORIST gets workspace:read)
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r.code = 'DIRECTOR' AND r."is_system" = true
  AND p.code IN ('workspace:read', 'operations:read')
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r.code = 'FLORIST' AND r."is_system" = true
  AND p.code = 'workspace:read'
ON CONFLICT DO NOTHING;
