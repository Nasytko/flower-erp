-- @destructive-reviewed
-- @data-guarded
-- Removes transfers, inventory counts, cash ledger modules and related permissions.
-- Runtime usage was removed before this migration; module tables are intentionally emptied.

BEGIN;

-- ---------------------------------------------------------------------------
-- Pre-cleanup guards: fail if rows use enum values scheduled for removal
-- (negative-test path: migration must abort and roll back)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "inventory_batches"
    WHERE "batch_source_type" IN ('TRANSFER_IN', 'COUNT_ADJUSTMENT')
  ) THEN
    RAISE EXCEPTION
      'DATA GUARD: inventory_batches contains TRANSFER_IN or COUNT_ADJUSTMENT rows (% rows). Remove or migrate before enum shrink.',
      (SELECT COUNT(*) FROM "inventory_batches"
       WHERE "batch_source_type" IN ('TRANSFER_IN', 'COUNT_ADJUSTMENT'));
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "inventory_movements"
    WHERE "type" IN (
      'TRANSFER_OUT',
      'TRANSFER_OUT_REVERSAL',
      'TRANSFER_IN',
      'TRANSFER_IN_REVERSAL'
    )
  ) THEN
    RAISE EXCEPTION
      'DATA GUARD: inventory_movements contains transfer movement types (% rows). Remove or migrate before enum shrink.',
      (SELECT COUNT(*) FROM "inventory_movements"
       WHERE "type" IN (
         'TRANSFER_OUT',
         'TRANSFER_OUT_REVERSAL',
         'TRANSFER_IN',
         'TRANSFER_IN_REVERSAL'
       ));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Module data cleanup (explicit; tables must be empty before DROP)
-- ---------------------------------------------------------------------------
DELETE FROM "inventory_movements"
WHERE "type" IN (
  'TRANSFER_OUT',
  'TRANSFER_OUT_REVERSAL',
  'TRANSFER_IN',
  'TRANSFER_IN_REVERSAL'
);

DELETE FROM "inventory_batches"
WHERE "batch_source_type" IN ('TRANSFER_IN', 'COUNT_ADJUSTMENT')
   OR "transfer_allocation_id" IS NOT NULL
   OR "inventory_count_item_id" IS NOT NULL;

DELETE FROM "transfer_allocations";
DELETE FROM "transfer_items";
DELETE FROM "transfer_documents";
DELETE FROM "inventory_count_items";
DELETE FROM "inventory_counts";
DELETE FROM "cash_operations";
DELETE FROM "cash_accounts";

DELETE FROM "role_permissions"
WHERE "permission_id" IN (
  SELECT "id" FROM "permissions"
  WHERE "code" IN (
    'transfers:read',
    'transfers:create',
    'transfers:dispatch',
    'transfers:receive',
    'transfers:cancel',
    'inventory-counts:read',
    'inventory-counts:create',
    'inventory-counts:count',
    'inventory-counts:post',
    'inventory-counts:cancel',
    'payments:view-cash',
    'payments:manual-adjustment',
    'operations:read'
  )
);

DELETE FROM "permissions"
WHERE "code" IN (
  'transfers:read',
  'transfers:create',
  'transfers:dispatch',
  'transfers:receive',
  'transfers:cancel',
  'inventory-counts:read',
  'inventory-counts:create',
  'inventory-counts:count',
  'inventory-counts:post',
  'inventory-counts:cancel',
  'payments:view-cash',
  'payments:manual-adjustment',
  'operations:read'
);

-- ---------------------------------------------------------------------------
-- Post-cleanup guards: module tables must be empty before DROP
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  remaining bigint;
BEGIN
  SELECT COUNT(*) INTO remaining FROM "cash_operations";
  IF remaining > 0 THEN
    RAISE EXCEPTION 'DATA GUARD: cash_operations still contains % rows', remaining;
  END IF;

  SELECT COUNT(*) INTO remaining FROM "cash_accounts";
  IF remaining > 0 THEN
    RAISE EXCEPTION 'DATA GUARD: cash_accounts still contains % rows', remaining;
  END IF;

  SELECT COUNT(*) INTO remaining FROM "transfer_documents";
  IF remaining > 0 THEN
    RAISE EXCEPTION 'DATA GUARD: transfer_documents still contains % rows', remaining;
  END IF;

  SELECT COUNT(*) INTO remaining FROM "transfer_items";
  IF remaining > 0 THEN
    RAISE EXCEPTION 'DATA GUARD: transfer_items still contains % rows', remaining;
  END IF;

  SELECT COUNT(*) INTO remaining FROM "transfer_allocations";
  IF remaining > 0 THEN
    RAISE EXCEPTION 'DATA GUARD: transfer_allocations still contains % rows', remaining;
  END IF;

  SELECT COUNT(*) INTO remaining FROM "inventory_counts";
  IF remaining > 0 THEN
    RAISE EXCEPTION 'DATA GUARD: inventory_counts still contains % rows', remaining;
  END IF;

  SELECT COUNT(*) INTO remaining FROM "inventory_count_items";
  IF remaining > 0 THEN
    RAISE EXCEPTION 'DATA GUARD: inventory_count_items still contains % rows', remaining;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Drop module tables and orphan enum types
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS "cash_operations";
DROP TABLE IF EXISTS "cash_accounts";

ALTER TABLE "inventory_batches" DROP CONSTRAINT IF EXISTS "inventory_batches_transfer_allocation_id_fkey";
ALTER TABLE "inventory_batches" DROP CONSTRAINT IF EXISTS "inventory_batches_inventory_count_item_id_fkey";
DROP INDEX IF EXISTS "inventory_batches_transfer_allocation_id_key";
DROP INDEX IF EXISTS "inventory_batches_inventory_count_item_id_key";
ALTER TABLE "inventory_batches" DROP COLUMN IF EXISTS "transfer_allocation_id";
ALTER TABLE "inventory_batches" DROP COLUMN IF EXISTS "inventory_count_item_id";

ALTER TABLE "transfer_allocations" DROP CONSTRAINT IF EXISTS "transfer_allocations_batch_id_fkey";
DROP TABLE IF EXISTS "transfer_allocations";
DROP TABLE IF EXISTS "transfer_items";
DROP TABLE IF EXISTS "transfer_documents";
DROP TABLE IF EXISTS "inventory_count_items";
DROP TABLE IF EXISTS "inventory_counts";

DROP TYPE IF EXISTS "CashOperationDirection";
DROP TYPE IF EXISTS "CashOperationType";
DROP TYPE IF EXISTS "CashAccountStatus";
DROP TYPE IF EXISTS "CashAccountType";
DROP TYPE IF EXISTS "TransferStatus";
DROP TYPE IF EXISTS "InventoryCountStatus";

-- ---------------------------------------------------------------------------
-- InventoryBatchSourceType: remove TRANSFER_IN and COUNT_ADJUSTMENT
-- Column inventory_batches.batch_source_type: NOT NULL DEFAULT 'GOODS_RECEIPT'
-- (added in 20260717120000_inventory_operations)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "inventory_batches"
    WHERE "batch_source_type" IN ('TRANSFER_IN', 'COUNT_ADJUSTMENT')
  ) THEN
    RAISE EXCEPTION
      'DATA GUARD: cannot shrink InventoryBatchSourceType while removed values remain';
  END IF;
END $$;

CREATE TYPE "InventoryBatchSourceType_new" AS ENUM ('GOODS_RECEIPT');

ALTER TABLE "inventory_batches"
  ALTER COLUMN "batch_source_type" DROP DEFAULT;

ALTER TABLE "inventory_batches"
  ALTER COLUMN "batch_source_type" TYPE "InventoryBatchSourceType_new"
  USING ("batch_source_type"::text::"InventoryBatchSourceType_new");

DROP TYPE "InventoryBatchSourceType";
ALTER TYPE "InventoryBatchSourceType_new" RENAME TO "InventoryBatchSourceType";

ALTER TABLE "inventory_batches"
  ALTER COLUMN "batch_source_type" SET DEFAULT 'GOODS_RECEIPT'::"InventoryBatchSourceType";

-- ---------------------------------------------------------------------------
-- InventoryMovementType: remove transfer movement types
-- Column inventory_movements.type: NOT NULL, no DEFAULT
-- (created NOT NULL without default in 20260715210000_master_data_hardening_and_supply_inventory)
-- @no-default
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "inventory_movements"
    WHERE "type" IN (
      'TRANSFER_OUT',
      'TRANSFER_OUT_REVERSAL',
      'TRANSFER_IN',
      'TRANSFER_IN_REVERSAL'
    )
  ) THEN
    RAISE EXCEPTION
      'DATA GUARD: cannot shrink InventoryMovementType while transfer types remain';
  END IF;
END $$;

CREATE TYPE "InventoryMovementType_new" AS ENUM (
  'RECEIPT',
  'RECEIPT_REVERSAL',
  'ISSUE',
  'ISSUE_REVERSAL',
  'WRITE_OFF',
  'WRITE_OFF_REVERSAL',
  'COUNT_ADJUSTMENT_OUT',
  'COUNT_ADJUSTMENT_IN'
);

ALTER TABLE "inventory_movements"
  ALTER COLUMN "type" TYPE "InventoryMovementType_new"
  USING ("type"::text::"InventoryMovementType_new");

DROP TYPE "InventoryMovementType";
ALTER TYPE "InventoryMovementType_new" RENAME TO "InventoryMovementType";

COMMIT;
