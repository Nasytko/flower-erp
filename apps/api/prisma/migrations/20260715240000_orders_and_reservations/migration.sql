-- Orders + Inventory reservations

CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'RESERVED', 'IN_PREPARATION', 'READY', 'COMPLETED', 'CANCELLED');
CREATE TYPE "OrderType" AS ENUM ('PICKUP', 'DELIVERY');
CREATE TYPE "InventoryReservationStatus" AS ENUM ('ACTIVE', 'RELEASED', 'CONSUMED');
CREATE TYPE "ReservationMovementType" AS ENUM ('RESERVE', 'RELEASE', 'CONSUME');

CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "type" "OrderType" NOT NULL DEFAULT 'PICKUP',
    "order_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ready_at" TIMESTAMP(3),
    "recipient_name" TEXT,
    "recipient_phone" TEXT,
    "comment" TEXT,
    "florist_user_id" UUID,
    "confirmed_at" TIMESTAMP(3),
    "reserved_at" TIMESTAMP(3),
    "preparation_started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "order_items_quantity_non_negative" CHECK ("quantity" > 0)
);

CREATE TABLE "inventory_reservations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "status" "InventoryReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "inventory_reservations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "inventory_reservations_quantity_positive" CHECK ("quantity" > 0)
);

CREATE TABLE "reservation_movements" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "type" "ReservationMovementType" NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "source_document_type" TEXT NOT NULL,
    "source_document_id" UUID NOT NULL,
    "source_document_item_id" UUID NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reservation_movements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "orders_organization_id_number_key" ON "orders"("organization_id", "number");
CREATE INDEX "orders_organization_id_idx" ON "orders"("organization_id");
CREATE INDEX "orders_organization_id_store_id_idx" ON "orders"("organization_id", "store_id");
CREATE INDEX "orders_organization_id_status_idx" ON "orders"("organization_id", "status");
CREATE INDEX "orders_organization_id_store_id_ready_at_idx" ON "orders"("organization_id", "store_id", "ready_at");
CREATE INDEX "orders_organization_id_store_id_order_date_idx" ON "orders"("organization_id", "store_id", "order_date");

CREATE UNIQUE INDEX "order_items_order_id_item_id_key" ON "order_items"("order_id", "item_id");
CREATE INDEX "order_items_organization_id_idx" ON "order_items"("organization_id");
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");
CREATE INDEX "order_items_item_id_idx" ON "order_items"("item_id");

CREATE INDEX "inventory_reservations_organization_id_idx" ON "inventory_reservations"("organization_id");
CREATE INDEX "inventory_reservations_organization_id_warehouse_id_idx" ON "inventory_reservations"("organization_id", "warehouse_id");
CREATE INDEX "inventory_reservations_organization_id_order_item_id_idx" ON "inventory_reservations"("organization_id", "order_item_id");
CREATE INDEX "inventory_reservations_batch_id_status_idx" ON "inventory_reservations"("batch_id", "status");
CREATE INDEX "inventory_reservations_organization_id_status_idx" ON "inventory_reservations"("organization_id", "status");

CREATE INDEX "reservation_movements_organization_id_idx" ON "reservation_movements"("organization_id");
CREATE INDEX "reservation_movements_reservation_id_idx" ON "reservation_movements"("reservation_id");
CREATE INDEX "reservation_movements_source_document_id_idx" ON "reservation_movements"("source_document_id");
CREATE INDEX "reservation_movements_occurred_at_idx" ON "reservation_movements"("occurred_at");

ALTER TABLE "orders" ADD CONSTRAINT "orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "order_items" ADD CONSTRAINT "order_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "inventory_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reservation_movements" ADD CONSTRAINT "reservation_movements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reservation_movements" ADD CONSTRAINT "reservation_movements_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reservation_movements" ADD CONSTRAINT "reservation_movements_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reservation_movements" ADD CONSTRAINT "reservation_movements_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reservation_movements" ADD CONSTRAINT "reservation_movements_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "inventory_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reservation_movements" ADD CONSTRAINT "reservation_movements_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "inventory_reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Order permissions
INSERT INTO "permissions" ("id", "code", "description") VALUES
  ('00000000-0000-4000-8000-000000000013', 'orders:read', 'View orders and order dashboard'),
  ('00000000-0000-4000-8000-000000000014', 'orders:create', 'Create and edit draft orders'),
  ('00000000-0000-4000-8000-000000000015', 'orders:confirm', 'Confirm orders'),
  ('00000000-0000-4000-8000-000000000016', 'orders:reserve', 'Retry stock reservation'),
  ('00000000-0000-4000-8000-000000000017', 'orders:fulfill', 'Start preparation, mark ready, complete'),
  ('00000000-0000-4000-8000-000000000018', 'orders:cancel', 'Cancel orders')
ON CONFLICT ("code") DO NOTHING;
