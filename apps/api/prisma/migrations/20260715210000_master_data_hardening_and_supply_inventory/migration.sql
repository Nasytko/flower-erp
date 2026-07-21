-- Master data hardening (ADR-011)
ALTER TABLE "units_of_measure" ADD COLUMN "quantity_scale" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "units_of_measure" ADD CONSTRAINT "units_of_measure_quantity_scale_check" CHECK ("quantity_scale" BETWEEN 0 AND 3);
ALTER TABLE "items" ADD COLUMN "is_purchasable" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "items" ADD COLUMN "is_sellable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "inventory_policies" DROP COLUMN "allow_fractional_quantity";
ALTER TABLE "inventory_policies" ADD COLUMN "preset_code" TEXT;
CREATE UNIQUE INDEX "inventory_policies_organization_id_preset_code_key"
  ON "inventory_policies"("organization_id", "preset_code");

-- Supply enums
CREATE TYPE "SupplyStatus" AS ENUM ('DRAFT', 'SUBMITTED_TO_SUPPLIER', 'PARTIALLY_RECEIVED', 'RECEIVED', 'ANNULLED');
CREATE TYPE "GoodsReceiptStatus" AS ENUM ('DRAFT', 'POSTED', 'REVERSED');
CREATE TYPE "InventoryBatchStatus" AS ENUM ('ACTIVE', 'DEPLETED', 'REVERSED');
CREATE TYPE "InventoryMovementType" AS ENUM ('RECEIPT', 'RECEIPT_REVERSAL');

CREATE TABLE "supplies" (
  "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "store_id" UUID NOT NULL,
  "warehouse_id" UUID NOT NULL, "supplier_id" UUID NOT NULL, "number" TEXT NOT NULL,
  "status" "SupplyStatus" NOT NULL DEFAULT 'DRAFT', "submitted_at" TIMESTAMP(3),
  "expected_receipt_date" DATE, "comment" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "supplies_pkey" PRIMARY KEY ("id"));
CREATE TABLE "supply_items" (
  "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "supply_id" UUID NOT NULL,
  "item_id" UUID NOT NULL, "ordered_quantity" DECIMAL(18,3) NOT NULL,
  "planned_unit_price" DECIMAL(18,4), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supply_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "supply_items_ordered_quantity_check" CHECK ("ordered_quantity" > 0));
CREATE TABLE "goods_receipts" (
  "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "store_id" UUID NOT NULL,
  "warehouse_id" UUID NOT NULL, "supply_id" UUID NOT NULL, "number" TEXT NOT NULL,
  "status" "GoodsReceiptStatus" NOT NULL DEFAULT 'DRAFT', "received_at" TIMESTAMP(3) NOT NULL,
  "posted_at" TIMESTAMP(3), "comment" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id"));
CREATE TABLE "goods_receipt_items" (
  "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "goods_receipt_id" UUID NOT NULL,
  "supply_item_id" UUID NOT NULL, "item_id" UUID NOT NULL, "received_quantity" DECIMAL(18,3) NOT NULL,
  "accepted_quantity" DECIMAL(18,3) NOT NULL, "defective_quantity" DECIMAL(18,3) NOT NULL,
  "actual_unit_price" DECIMAL(18,4) NOT NULL, "defect_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "goods_receipt_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "goods_receipt_items_quantities_check" CHECK (
    "received_quantity" > 0 AND "accepted_quantity" >= 0 AND "defective_quantity" >= 0
    AND "received_quantity" = "accepted_quantity" + "defective_quantity"));

CREATE TABLE "inventory_batches" (
  "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "store_id" UUID NOT NULL,
  "warehouse_id" UUID NOT NULL, "item_id" UUID NOT NULL, "goods_receipt_item_id" UUID NOT NULL,
  "received_at" TIMESTAMP(3) NOT NULL, "initial_quantity" DECIMAL(18,3) NOT NULL,
  "remaining_quantity" DECIMAL(18,3) NOT NULL, "unit_cost" DECIMAL(18,4) NOT NULL,
  "expires_at" DATE, "status" "InventoryBatchStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_batches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_batches_quantities_check" CHECK ("initial_quantity" > 0 AND "remaining_quantity" >= 0 AND "remaining_quantity" <= "initial_quantity"));
CREATE TABLE "inventory_movements" (
  "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "store_id" UUID NOT NULL,
  "warehouse_id" UUID NOT NULL, "item_id" UUID NOT NULL, "batch_id" UUID,
  "type" "InventoryMovementType" NOT NULL, "quantity" DECIMAL(18,3) NOT NULL,
  "unit_cost" DECIMAL(18,4), "source_document_type" TEXT NOT NULL,
  "source_document_id" UUID NOT NULL, "source_document_item_id" UUID NOT NULL,
  "reversal_of_movement_id" UUID, "occurred_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_movements_quantity_check" CHECK ("quantity" <> 0));
CREATE TABLE "inventory_balances" (
  "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "store_id" UUID NOT NULL,
  "warehouse_id" UUID NOT NULL, "item_id" UUID NOT NULL, "on_hand_quantity" DECIMAL(18,3) NOT NULL,
  "reserved_quantity" DECIMAL(18,3) NOT NULL DEFAULT 0, "available_quantity" DECIMAL(18,3) NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "inventory_balances_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_balances_quantities_check" CHECK ("on_hand_quantity" >= 0 AND "reserved_quantity" >= 0 AND "available_quantity" >= 0 AND "available_quantity" = "on_hand_quantity" - "reserved_quantity"));
CREATE TABLE "posting_idempotency_keys" (
  "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "scope" TEXT NOT NULL, "key" TEXT NOT NULL,
  "document_id" UUID NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "posting_idempotency_keys_pkey" PRIMARY KEY ("id"));

CREATE UNIQUE INDEX "supplies_organization_id_number_key" ON "supplies"("organization_id","number");
CREATE UNIQUE INDEX "supply_items_supply_id_item_id_key" ON "supply_items"("supply_id","item_id");
CREATE UNIQUE INDEX "goods_receipts_organization_id_number_key" ON "goods_receipts"("organization_id","number");
CREATE UNIQUE INDEX "goods_receipt_items_goods_receipt_id_supply_item_id_key" ON "goods_receipt_items"("goods_receipt_id","supply_item_id");
CREATE UNIQUE INDEX "inventory_batches_goods_receipt_item_id_key" ON "inventory_batches"("goods_receipt_item_id");
CREATE UNIQUE INDEX "inventory_movements_organization_id_source_document_type_source_document_item_id_type_key" ON "inventory_movements"("organization_id","source_document_type","source_document_item_id","type");
CREATE UNIQUE INDEX "inventory_balances_organization_id_store_id_warehouse_id_item_id_key" ON "inventory_balances"("organization_id","store_id","warehouse_id","item_id");
CREATE UNIQUE INDEX "posting_idempotency_keys_organization_id_scope_key_key" ON "posting_idempotency_keys"("organization_id","scope","key");
CREATE INDEX "supplies_organization_id_store_id_idx" ON "supplies"("organization_id","store_id");
CREATE INDEX "supplies_organization_id_status_idx" ON "supplies"("organization_id","status");
CREATE INDEX "goods_receipts_organization_id_store_id_idx" ON "goods_receipts"("organization_id","store_id");
CREATE INDEX "goods_receipts_supply_id_idx" ON "goods_receipts"("supply_id");
CREATE INDEX "inventory_batches_organization_id_warehouse_id_idx" ON "inventory_batches"("organization_id","warehouse_id");
CREATE INDEX "inventory_movements_organization_id_warehouse_id_idx" ON "inventory_movements"("organization_id","warehouse_id");
CREATE INDEX "inventory_movements_occurred_at_idx" ON "inventory_movements"("occurred_at");
CREATE INDEX "inventory_balances_organization_id_warehouse_id_idx" ON "inventory_balances"("organization_id","warehouse_id");
CREATE INDEX "posting_idempotency_keys_organization_id_document_id_idx" ON "posting_idempotency_keys"("organization_id","document_id");

ALTER TABLE "supplies" ADD CONSTRAINT "supplies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplies" ADD CONSTRAINT "supplies_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplies" ADD CONSTRAINT "supplies_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplies" ADD CONSTRAINT "supplies_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supply_items" ADD CONSTRAINT "supply_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supply_items" ADD CONSTRAINT "supply_items_supply_id_fkey" FOREIGN KEY ("supply_id") REFERENCES "supplies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supply_items" ADD CONSTRAINT "supply_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_supply_id_fkey" FOREIGN KEY ("supply_id") REFERENCES "supplies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_goods_receipt_id_fkey" FOREIGN KEY ("goods_receipt_id") REFERENCES "goods_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_supply_item_id_fkey" FOREIGN KEY ("supply_item_id") REFERENCES "supply_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_goods_receipt_item_id_fkey" FOREIGN KEY ("goods_receipt_item_id") REFERENCES "goods_receipt_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "inventory_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_reversal_of_movement_id_fkey" FOREIGN KEY ("reversal_of_movement_id") REFERENCES "inventory_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "posting_idempotency_keys" ADD CONSTRAINT "posting_idempotency_keys_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
