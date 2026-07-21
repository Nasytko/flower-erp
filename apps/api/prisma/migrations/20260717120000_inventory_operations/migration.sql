-- EPIC 12: inventory operations and transfers

CREATE TYPE "InventoryBatchSourceType" AS ENUM ('GOODS_RECEIPT', 'TRANSFER_IN', 'COUNT_ADJUSTMENT');
ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'WRITE_OFF';
ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'WRITE_OFF_REVERSAL';
ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'TRANSFER_OUT';
ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'TRANSFER_OUT_REVERSAL';
ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'TRANSFER_IN';
ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'TRANSFER_IN_REVERSAL';
ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'COUNT_ADJUSTMENT_OUT';
ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'COUNT_ADJUSTMENT_IN';

CREATE TYPE "WriteOffStatus" AS ENUM ('DRAFT', 'POSTED', 'REVERSED');
CREATE TYPE "WriteOffReason" AS ENUM (
  'WILTED', 'BROKEN', 'DAMAGED', 'EXPIRED', 'QUALITY_ISSUE', 'THEFT', 'INTERNAL_USE', 'OTHER'
);
CREATE TYPE "InventoryCountStatus" AS ENUM ('DRAFT', 'COUNTED', 'POSTED', 'CANCELLED');
CREATE TYPE "TransferStatus" AS ENUM ('DRAFT', 'DISPATCHED', 'RECEIVED', 'CANCELLED', 'REVERSED');
CREATE TYPE "TransferTimelineEventType" AS ENUM (
  'TRANSFER_CREATED', 'TRANSFER_DISPATCHED', 'TRANSFER_RECEIVED', 'TRANSFER_CANCELLED', 'TRANSFER_REVERSED'
);

ALTER TABLE "inventory_batches"
  ALTER COLUMN "goods_receipt_item_id" DROP NOT NULL;
ALTER TABLE "inventory_batches"
  ADD COLUMN "batch_source_type" "InventoryBatchSourceType" NOT NULL DEFAULT 'GOODS_RECEIPT',
  ADD COLUMN "transfer_allocation_id" UUID,
  ADD COLUMN "inventory_count_item_id" UUID;

CREATE UNIQUE INDEX "inventory_batches_transfer_allocation_id_key"
  ON "inventory_batches"("transfer_allocation_id");
CREATE UNIQUE INDEX "inventory_batches_inventory_count_item_id_key"
  ON "inventory_batches"("inventory_count_item_id");

CREATE TABLE "write_off_documents" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "warehouse_id" UUID NOT NULL,
  "number" TEXT NOT NULL,
  "status" "WriteOffStatus" NOT NULL DEFAULT 'DRAFT',
  "reason" "WriteOffReason" NOT NULL,
  "comment" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "posted_at" TIMESTAMP(3),
  "reversed_at" TIMESTAMP(3),
  "created_by_membership_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "write_off_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "write_off_items" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "write_off_document_id" UUID NOT NULL,
  "item_id" UUID NOT NULL,
  "quantity" DECIMAL(18,3) NOT NULL,
  "unit_cost_snapshot" DECIMAL(18,4),
  "cost_amount_snapshot" DECIMAL(18,4),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "write_off_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory_counts" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "warehouse_id" UUID NOT NULL,
  "number" TEXT NOT NULL,
  "status" "InventoryCountStatus" NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "counted_at" TIMESTAMP(3),
  "posted_at" TIMESTAMP(3),
  "cancelled_at" TIMESTAMP(3),
  "comment" TEXT,
  "created_by_membership_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inventory_counts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory_count_items" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "inventory_count_id" UUID NOT NULL,
  "item_id" UUID NOT NULL,
  "expected_quantity" DECIMAL(18,3) NOT NULL,
  "counted_quantity" DECIMAL(18,3),
  "variance_quantity" DECIMAL(18,3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inventory_count_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "transfer_documents" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "from_warehouse_id" UUID NOT NULL,
  "to_warehouse_id" UUID NOT NULL,
  "number" TEXT NOT NULL,
  "status" "TransferStatus" NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "dispatched_at" TIMESTAMP(3),
  "received_at" TIMESTAMP(3),
  "cancelled_at" TIMESTAMP(3),
  "reversed_at" TIMESTAMP(3),
  "comment" TEXT,
  "created_by_membership_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "transfer_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "transfer_items" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "transfer_document_id" UUID NOT NULL,
  "item_id" UUID NOT NULL,
  "requested_quantity" DECIMAL(18,3) NOT NULL,
  "dispatched_quantity" DECIMAL(18,3),
  "received_quantity" DECIMAL(18,3),
  "damaged_quantity" DECIMAL(18,3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "transfer_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "transfer_allocations" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "transfer_document_id" UUID NOT NULL,
  "transfer_item_id" UUID NOT NULL,
  "from_item_id" UUID NOT NULL,
  "batch_id" UUID NOT NULL,
  "quantity_dispatched" DECIMAL(18,3) NOT NULL,
  "quantity_received" DECIMAL(18,3),
  "quantity_damaged" DECIMAL(18,3),
  "unit_cost" DECIMAL(18,4) NOT NULL,
  "to_item_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "transfer_allocations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "transfer_timeline_events" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "transfer_document_id" UUID NOT NULL,
  "type" "TransferTimelineEventType" NOT NULL,
  "message" TEXT,
  "actor_membership_id" UUID,
  "payload" JSONB,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "transfer_timeline_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "write_off_documents_organization_id_number_key"
  ON "write_off_documents"("organization_id", "number");
CREATE INDEX "write_off_documents_organization_id_store_id_idx"
  ON "write_off_documents"("organization_id", "store_id");
CREATE INDEX "write_off_documents_organization_id_warehouse_id_idx"
  ON "write_off_documents"("organization_id", "warehouse_id");
CREATE INDEX "write_off_documents_organization_id_status_idx"
  ON "write_off_documents"("organization_id", "status");

CREATE INDEX "write_off_items_organization_id_idx" ON "write_off_items"("organization_id");
CREATE INDEX "write_off_items_write_off_document_id_idx" ON "write_off_items"("write_off_document_id");
CREATE INDEX "write_off_items_item_id_idx" ON "write_off_items"("item_id");

CREATE UNIQUE INDEX "inventory_counts_organization_id_number_key"
  ON "inventory_counts"("organization_id", "number");
CREATE INDEX "inventory_counts_organization_id_store_id_idx"
  ON "inventory_counts"("organization_id", "store_id");
CREATE INDEX "inventory_counts_organization_id_warehouse_id_idx"
  ON "inventory_counts"("organization_id", "warehouse_id");
CREATE INDEX "inventory_counts_organization_id_status_idx"
  ON "inventory_counts"("organization_id", "status");

CREATE UNIQUE INDEX "inventory_count_items_inventory_count_id_item_id_key"
  ON "inventory_count_items"("inventory_count_id", "item_id");
CREATE INDEX "inventory_count_items_organization_id_idx" ON "inventory_count_items"("organization_id");
CREATE INDEX "inventory_count_items_inventory_count_id_idx" ON "inventory_count_items"("inventory_count_id");
CREATE INDEX "inventory_count_items_item_id_idx" ON "inventory_count_items"("item_id");

CREATE UNIQUE INDEX "transfer_documents_organization_id_number_key"
  ON "transfer_documents"("organization_id", "number");
CREATE INDEX "transfer_documents_organization_id_store_id_idx"
  ON "transfer_documents"("organization_id", "store_id");
CREATE INDEX "transfer_documents_organization_id_from_warehouse_id_idx"
  ON "transfer_documents"("organization_id", "from_warehouse_id");
CREATE INDEX "transfer_documents_organization_id_to_warehouse_id_idx"
  ON "transfer_documents"("organization_id", "to_warehouse_id");
CREATE INDEX "transfer_documents_organization_id_status_idx"
  ON "transfer_documents"("organization_id", "status");

CREATE INDEX "transfer_items_organization_id_idx" ON "transfer_items"("organization_id");
CREATE INDEX "transfer_items_transfer_document_id_idx" ON "transfer_items"("transfer_document_id");
CREATE INDEX "transfer_items_item_id_idx" ON "transfer_items"("item_id");

CREATE INDEX "transfer_allocations_organization_id_idx" ON "transfer_allocations"("organization_id");
CREATE INDEX "transfer_allocations_transfer_document_id_idx" ON "transfer_allocations"("transfer_document_id");
CREATE INDEX "transfer_allocations_transfer_item_id_idx" ON "transfer_allocations"("transfer_item_id");
CREATE INDEX "transfer_allocations_batch_id_idx" ON "transfer_allocations"("batch_id");

CREATE INDEX "transfer_timeline_events_organization_id_idx" ON "transfer_timeline_events"("organization_id");
CREATE INDEX "transfer_timeline_events_transfer_document_id_occurred_at_idx"
  ON "transfer_timeline_events"("transfer_document_id", "occurred_at");

ALTER TABLE "write_off_documents"
  ADD CONSTRAINT "write_off_documents_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "write_off_documents"
  ADD CONSTRAINT "write_off_documents_store_id_fkey"
  FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "write_off_documents"
  ADD CONSTRAINT "write_off_documents_warehouse_id_fkey"
  FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "write_off_items"
  ADD CONSTRAINT "write_off_items_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "write_off_items"
  ADD CONSTRAINT "write_off_items_write_off_document_id_fkey"
  FOREIGN KEY ("write_off_document_id") REFERENCES "write_off_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "write_off_items"
  ADD CONSTRAINT "write_off_items_item_id_fkey"
  FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_counts"
  ADD CONSTRAINT "inventory_counts_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_counts"
  ADD CONSTRAINT "inventory_counts_store_id_fkey"
  FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_counts"
  ADD CONSTRAINT "inventory_counts_warehouse_id_fkey"
  FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_count_items"
  ADD CONSTRAINT "inventory_count_items_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_count_items"
  ADD CONSTRAINT "inventory_count_items_inventory_count_id_fkey"
  FOREIGN KEY ("inventory_count_id") REFERENCES "inventory_counts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_count_items"
  ADD CONSTRAINT "inventory_count_items_item_id_fkey"
  FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "transfer_documents"
  ADD CONSTRAINT "transfer_documents_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transfer_documents"
  ADD CONSTRAINT "transfer_documents_store_id_fkey"
  FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transfer_documents"
  ADD CONSTRAINT "transfer_documents_from_warehouse_id_fkey"
  FOREIGN KEY ("from_warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transfer_documents"
  ADD CONSTRAINT "transfer_documents_to_warehouse_id_fkey"
  FOREIGN KEY ("to_warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "transfer_items"
  ADD CONSTRAINT "transfer_items_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transfer_items"
  ADD CONSTRAINT "transfer_items_transfer_document_id_fkey"
  FOREIGN KEY ("transfer_document_id") REFERENCES "transfer_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transfer_items"
  ADD CONSTRAINT "transfer_items_item_id_fkey"
  FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "transfer_allocations"
  ADD CONSTRAINT "transfer_allocations_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transfer_allocations"
  ADD CONSTRAINT "transfer_allocations_transfer_document_id_fkey"
  FOREIGN KEY ("transfer_document_id") REFERENCES "transfer_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transfer_allocations"
  ADD CONSTRAINT "transfer_allocations_transfer_item_id_fkey"
  FOREIGN KEY ("transfer_item_id") REFERENCES "transfer_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transfer_allocations"
  ADD CONSTRAINT "transfer_allocations_from_item_id_fkey"
  FOREIGN KEY ("from_item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transfer_allocations"
  ADD CONSTRAINT "transfer_allocations_to_item_id_fkey"
  FOREIGN KEY ("to_item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transfer_allocations"
  ADD CONSTRAINT "transfer_allocations_batch_id_fkey"
  FOREIGN KEY ("batch_id") REFERENCES "inventory_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "transfer_timeline_events"
  ADD CONSTRAINT "transfer_timeline_events_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transfer_timeline_events"
  ADD CONSTRAINT "transfer_timeline_events_transfer_document_id_fkey"
  FOREIGN KEY ("transfer_document_id") REFERENCES "transfer_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_batches"
  ADD CONSTRAINT "inventory_batches_transfer_allocation_id_fkey"
  FOREIGN KEY ("transfer_allocation_id") REFERENCES "transfer_allocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_batches"
  ADD CONSTRAINT "inventory_batches_inventory_count_item_id_fkey"
  FOREIGN KEY ("inventory_count_item_id") REFERENCES "inventory_count_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "code", "description")
SELECT gen_random_uuid(), p.code, p.description
FROM (VALUES
  ('write-offs:read', 'View write-off documents and history'),
  ('write-offs:create', 'Create draft inventory write-offs'),
  ('write-offs:post', 'Post write-off documents'),
  ('write-offs:reverse', 'Reverse posted write-off documents'),
  ('transfers:read', 'View transfer documents and in-transit inventory'),
  ('transfers:create', 'Create draft inventory transfers'),
  ('transfers:dispatch', 'Dispatch transfer documents from source warehouse'),
  ('transfers:receive', 'Receive transfer documents into destination warehouse'),
  ('transfers:cancel', 'Cancel or reverse transfer documents'),
  ('inventory-counts:read', 'View inventory counts and progress'),
  ('inventory-counts:create', 'Create inventory count snapshots'),
  ('inventory-counts:count', 'Enter counted quantities for inventory counts'),
  ('inventory-counts:post', 'Post inventory count adjustments'),
  ('inventory-counts:cancel', 'Cancel inventory count documents'),
  ('inventory-adjustments:view-cost', 'View cost amounts on write-offs, transfers, and count adjustments')
) AS p(code, description)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r.code = 'DIRECTOR' AND r."is_system" = true
  AND p.code IN (
    'write-offs:read','write-offs:create','write-offs:post','write-offs:reverse',
    'transfers:read','transfers:create','transfers:dispatch','transfers:receive','transfers:cancel',
    'inventory-counts:read','inventory-counts:create','inventory-counts:count','inventory-counts:post','inventory-counts:cancel',
    'inventory-adjustments:view-cost'
  )
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r.code = 'FLORIST' AND r."is_system" = true
  AND p.code IN (
    'write-offs:read','write-offs:create',
    'transfers:read',
    'inventory-counts:read','inventory-counts:count'
  )
ON CONFLICT DO NOTHING;
