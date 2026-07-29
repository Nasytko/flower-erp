-- Remove transfers, inventory counts, cash ledger, and related permissions.

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

DROP TABLE IF EXISTS "cash_operations";
DROP TABLE IF EXISTS "cash_accounts";
DROP TABLE IF EXISTS "transfer_allocations";
DROP TABLE IF EXISTS "transfer_items";
DROP TABLE IF EXISTS "transfer_documents";
DROP TABLE IF EXISTS "inventory_count_items";
DROP TABLE IF EXISTS "inventory_counts";

ALTER TABLE "inventory_batches" DROP CONSTRAINT IF EXISTS "inventory_batches_transfer_allocation_id_fkey";
ALTER TABLE "inventory_batches" DROP CONSTRAINT IF EXISTS "inventory_batches_inventory_count_item_id_fkey";
ALTER TABLE "inventory_batches" DROP COLUMN IF EXISTS "transfer_allocation_id";
ALTER TABLE "inventory_batches" DROP COLUMN IF EXISTS "inventory_count_item_id";

DROP TYPE IF EXISTS "CashOperationDirection";
DROP TYPE IF EXISTS "CashOperationType";
DROP TYPE IF EXISTS "CashAccountStatus";
DROP TYPE IF EXISTS "CashAccountType";
DROP TYPE IF EXISTS "TransferStatus";
DROP TYPE IF EXISTS "InventoryCountStatus";

-- InventoryBatchSourceType: remove TRANSFER_IN and COUNT_ADJUSTMENT
CREATE TYPE "InventoryBatchSourceType_new" AS ENUM ('GOODS_RECEIPT');
ALTER TABLE "inventory_batches"
  ALTER COLUMN "batch_source_type" TYPE "InventoryBatchSourceType_new"
  USING ('GOODS_RECEIPT'::"InventoryBatchSourceType_new");
DROP TYPE "InventoryBatchSourceType";
ALTER TYPE "InventoryBatchSourceType_new" RENAME TO "InventoryBatchSourceType";

-- InventoryMovementType: remove transfer movement types
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
