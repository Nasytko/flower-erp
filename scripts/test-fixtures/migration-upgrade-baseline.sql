-- Baseline fixture for migration upgrade test (schema at 20260729150000).
-- Inserts surviving enum values only; module tables left empty.

INSERT INTO "organizations" ("id", "name", "status", "created_at", "updated_at")
VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Migration Test Org',
  'ACTIVE',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

INSERT INTO "stores" (
  "id", "organization_id", "name", "code", "timezone", "status", "created_at", "updated_at"
) VALUES (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Test Store',
  'TST',
  'Europe/Moscow',
  'ACTIVE',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

INSERT INTO "warehouses" (
  "id", "organization_id", "store_id", "name", "code", "type", "is_default", "status", "created_at", "updated_at"
) VALUES (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'Main WH',
  'WH1',
  'STORE',
  true,
  'ACTIVE',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

INSERT INTO "item_categories" (
  "id", "organization_id", "name", "code", "status", "created_at", "updated_at"
) VALUES (
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Flowers',
  'FLW',
  'ACTIVE',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

INSERT INTO "units_of_measure" (
  "id", "organization_id", "name", "symbol", "status", "created_at", "updated_at"
) VALUES (
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Piece',
  'pcs',
  'ACTIVE',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

INSERT INTO "inventory_policies" (
  "id", "organization_id", "name", "item_type", "tracking_method", "reservation_allowed",
  "expiration_tracking", "status", "created_at", "updated_at"
) VALUES (
  'ffffffff-ffff-4fff-8fff-ffffffffffff',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Flower LOT',
  'FLOWER',
  'LOT',
  false,
  true,
  'ACTIVE',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

INSERT INTO "items" (
  "id", "organization_id", "category_id", "unit_id", "inventory_policy_id",
  "name", "code", "item_type", "status", "created_at", "updated_at"
) VALUES (
  '10101010-1010-4101-8101-101010101010',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'ffffffff-ffff-4fff-8fff-ffffffffffff',
  'Rose',
  'ROSE-001',
  'FLOWER',
  'ACTIVE',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

INSERT INTO "inventory_batches" (
  "id", "organization_id", "store_id", "warehouse_id", "item_id",
  "batch_source_type", "received_at", "initial_quantity", "remaining_quantity",
  "unit_cost", "status", "created_at"
) VALUES (
  '20202020-2020-4202-8202-202020202020',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  '10101010-1010-4101-8101-101010101010',
  'GOODS_RECEIPT',
  CURRENT_TIMESTAMP,
  10.000,
  10.000,
  1.5000,
  'ACTIVE',
  CURRENT_TIMESTAMP
);

INSERT INTO "inventory_movements" (
  "id", "organization_id", "store_id", "warehouse_id", "item_id", "batch_id",
  "type", "quantity", "unit_cost", "source_document_type", "source_document_id",
  "source_document_item_id", "occurred_at", "created_at"
) VALUES (
  '30303030-3030-4303-8303-303030303030',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  '10101010-1010-4101-8101-101010101010',
  '20202020-2020-4202-8202-202020202020',
  'RECEIPT',
  10.000,
  1.5000,
  'GOODS_RECEIPT',
  '40404040-4040-4404-8404-404040404040',
  '50505050-5050-4505-8505-505050505050',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);
