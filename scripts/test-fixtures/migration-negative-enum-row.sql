-- Negative-test row: uses enum value scheduled for removal.
INSERT INTO "inventory_batches" (
  "id", "organization_id", "store_id", "warehouse_id", "item_id",
  "batch_source_type", "received_at", "initial_quantity", "remaining_quantity",
  "unit_cost", "status", "created_at"
) VALUES (
  '60606060-6060-4606-8606-606060606060',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  '10101010-1010-4101-8101-101010101010',
  'TRANSFER_IN',
  CURRENT_TIMESTAMP,
  5.000,
  5.000,
  2.0000,
  'ACTIVE',
  CURRENT_TIMESTAMP
);
