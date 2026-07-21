-- Epic 08: Sales & Inventory Consumption (ADR-016/017/018)

ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'ISSUE';
ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'ISSUE_REVERSAL';

CREATE TYPE "SaleType" AS ENUM ('ORDER_BASED', 'DIRECT');
CREATE TYPE "SaleStatus" AS ENUM ('DRAFT', 'COMPLETED', 'ANNULLED');
CREATE TYPE "SalesChannel" AS ENUM ('STORE', 'PHONE', 'WEBSITE', 'TELEGRAM', 'OTHER');
CREATE TYPE "DiscountType" AS ENUM ('NONE', 'PERCENT', 'FIXED');
CREATE TYPE "DiscountReason" AS ENUM ('PROMOTION', 'LOYAL_CUSTOMER', 'AGED_FLOWERS', 'MANAGER_DECISION', 'OTHER');
CREATE TYPE "SaleInventorySourceType" AS ENUM ('ORDER_ACTUAL_COMPOSITION', 'DIRECT_COMPOSITION');
CREATE TYPE "SaleTimelineEventType" AS ENUM (
  'SALE_CREATED', 'SALE_COMPLETED', 'SALE_ANNULLED', 'DISCOUNT_APPLIED', 'INVENTORY_ISSUED', 'INVENTORY_REVERSED'
);

CREATE TABLE "sales" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "order_id" UUID,
    "number" TEXT NOT NULL,
    "type" "SaleType" NOT NULL,
    "status" "SaleStatus" NOT NULL DEFAULT 'DRAFT',
    "sales_channel" "SalesChannel" NOT NULL DEFAULT 'STORE',
    "gross_amount" DECIMAL(18,2) NOT NULL,
    "discount_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "net_amount" DECIMAL(18,2) NOT NULL,
    "cost_amount" DECIMAL(18,4),
    "gross_profit_amount" DECIMAL(18,4),
    "margin_percent" DECIMAL(9,4),
    "currency_code" TEXT NOT NULL DEFAULT 'BYN',
    "comment" TEXT,
    "completed_at" TIMESTAMP(3),
    "annulled_at" TIMESTAMP(3),
    "created_by_membership_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "sales_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sales_amounts_check" CHECK ("discount_amount" >= 0 AND "discount_amount" <= "gross_amount" AND "net_amount" = "gross_amount" - "discount_amount")
);

CREATE UNIQUE INDEX "sales_organization_id_number_key" ON "sales"("organization_id", "number");
CREATE UNIQUE INDEX "sales_one_active_per_order" ON "sales"("order_id") WHERE "order_id" IS NOT NULL AND "status" <> 'ANNULLED';
CREATE INDEX "sales_organization_id_idx" ON "sales"("organization_id");
CREATE INDEX "sales_organization_id_store_id_idx" ON "sales"("organization_id", "store_id");
CREATE INDEX "sales_organization_id_status_idx" ON "sales"("organization_id", "status");
CREATE INDEX "sales_organization_id_type_idx" ON "sales"("organization_id", "type");
CREATE INDEX "sales_organization_id_completed_at_idx" ON "sales"("organization_id", "completed_at");
CREATE INDEX "sales_order_id_idx" ON "sales"("order_id");

ALTER TABLE "sales" ADD CONSTRAINT "sales_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales" ADD CONSTRAINT "sales_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales" ADD CONSTRAINT "sales_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "sale_lines" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "item_id" UUID,
    "description_snapshot" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unit_price" DECIMAL(18,2) NOT NULL,
    "gross_amount" DECIMAL(18,2) NOT NULL,
    "discount_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "net_amount" DECIMAL(18,2) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sale_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sale_lines_quantity_check" CHECK ("quantity" > 0)
);

CREATE INDEX "sale_lines_organization_id_idx" ON "sale_lines"("organization_id");
CREATE INDEX "sale_lines_sale_id_idx" ON "sale_lines"("sale_id");
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "sale_discounts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "type" "DiscountType" NOT NULL DEFAULT 'NONE',
    "value" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "reason" "DiscountReason" NOT NULL DEFAULT 'OTHER',
    "comment" TEXT,
    "approved_by_membership_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sale_discounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sale_discounts_sale_id_key" ON "sale_discounts"("sale_id");
CREATE INDEX "sale_discounts_organization_id_idx" ON "sale_discounts"("organization_id");
ALTER TABLE "sale_discounts" ADD CONSTRAINT "sale_discounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_discounts" ADD CONSTRAINT "sale_discounts_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "sale_inventory_consumptions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "source_type" "SaleInventorySourceType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sale_inventory_consumptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sale_inventory_consumptions_sale_id_key" ON "sale_inventory_consumptions"("sale_id");
CREATE INDEX "sale_inventory_consumptions_organization_id_idx" ON "sale_inventory_consumptions"("organization_id");
ALTER TABLE "sale_inventory_consumptions" ADD CONSTRAINT "sale_inventory_consumptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_inventory_consumptions" ADD CONSTRAINT "sale_inventory_consumptions_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "sale_inventory_consumption_lines" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "consumption_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "requested_quantity" DECIMAL(18,3) NOT NULL,
    "issued_quantity" DECIMAL(18,3) NOT NULL,
    "cost_amount" DECIMAL(18,4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sale_inventory_consumption_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sale_inventory_consumption_lines_organization_id_idx" ON "sale_inventory_consumption_lines"("organization_id");
CREATE INDEX "sale_inventory_consumption_lines_consumption_id_idx" ON "sale_inventory_consumption_lines"("consumption_id");
CREATE INDEX "sale_inventory_consumption_lines_item_id_idx" ON "sale_inventory_consumption_lines"("item_id");
ALTER TABLE "sale_inventory_consumption_lines" ADD CONSTRAINT "sale_inventory_consumption_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_inventory_consumption_lines" ADD CONSTRAINT "sale_inventory_consumption_lines_consumption_id_fkey" FOREIGN KEY ("consumption_id") REFERENCES "sale_inventory_consumptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "sale_timeline_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "type" "SaleTimelineEventType" NOT NULL,
    "message" TEXT,
    "actor_membership_id" UUID,
    "payload" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sale_timeline_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sale_timeline_events_organization_id_idx" ON "sale_timeline_events"("organization_id");
CREATE INDEX "sale_timeline_events_sale_id_occurred_at_idx" ON "sale_timeline_events"("sale_id", "occurred_at");
ALTER TABLE "sale_timeline_events" ADD CONSTRAINT "sale_timeline_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_timeline_events" ADD CONSTRAINT "sale_timeline_events_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "sale_annulments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "actor_membership_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sale_annulments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sale_annulments_sale_id_key" ON "sale_annulments"("sale_id");
CREATE INDEX "sale_annulments_organization_id_idx" ON "sale_annulments"("organization_id");
ALTER TABLE "sale_annulments" ADD CONSTRAINT "sale_annulments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_annulments" ADD CONSTRAINT "sale_annulments_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "code", "description") VALUES
  (gen_random_uuid(), 'sales:read', 'View sales'),
  (gen_random_uuid(), 'sales:create', 'Create draft sales'),
  (gen_random_uuid(), 'sales:complete', 'Complete sales and issue stock'),
  (gen_random_uuid(), 'sales:annul', 'Annul completed sales'),
  (gen_random_uuid(), 'sales:view-cost', 'View sale COGS'),
  (gen_random_uuid(), 'sales:view-margin', 'View sale margin'),
  (gen_random_uuid(), 'sales:discount', 'Apply discounts within threshold'),
  (gen_random_uuid(), 'sales:discount-override', 'Apply discounts above threshold')
ON CONFLICT ("code") DO NOTHING;
