-- EPIC 12 hardening: cutoff, CHECK constraints, partial unique active count

ALTER TABLE "inventory_counts"
  ADD COLUMN "cutoff_at" TIMESTAMP(3);

UPDATE "inventory_counts"
SET "cutoff_at" = COALESCE("created_at", CURRENT_TIMESTAMP)
WHERE "cutoff_at" IS NULL;

ALTER TABLE "inventory_counts"
  ALTER COLUMN "cutoff_at" SET NOT NULL;

ALTER TABLE "write_off_items"
  ADD CONSTRAINT "write_off_items_quantity_check" CHECK ("quantity" > 0);

ALTER TABLE "transfer_items"
  ADD CONSTRAINT "transfer_items_requested_quantity_check" CHECK ("requested_quantity" > 0);

ALTER TABLE "transfer_allocations"
  ADD CONSTRAINT "transfer_allocations_quantity_dispatched_check" CHECK ("quantity_dispatched" > 0);

ALTER TABLE "inventory_count_items"
  ADD CONSTRAINT "inventory_count_items_expected_quantity_check" CHECK ("expected_quantity" >= 0);

ALTER TABLE "transfer_documents"
  ADD CONSTRAINT "transfer_documents_warehouses_differ_check" CHECK ("from_warehouse_id" <> "to_warehouse_id");

CREATE UNIQUE INDEX "inventory_counts_one_active_per_warehouse"
  ON "inventory_counts" ("organization_id", "warehouse_id")
  WHERE "status" IN ('DRAFT', 'COUNTED');
