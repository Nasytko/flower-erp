-- Deletion approval queue + permissions + DEVELOPER system role

CREATE TYPE "DeletionRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE "DeletionEntityType" AS ENUM (
  'ITEM',
  'SUPPLIER',
  'CATEGORY',
  'INVENTORY_POLICY',
  'CUSTOMER',
  'USER',
  'COURIER',
  'PAYMENT_METHOD'
);

CREATE TABLE "deletion_requests" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "entity_type" "DeletionEntityType" NOT NULL,
  "entity_id" UUID NOT NULL,
  "entity_label" TEXT NOT NULL,
  "store_id" UUID,
  "status" "DeletionRequestStatus" NOT NULL DEFAULT 'PENDING',
  "reason" TEXT,
  "requested_by_membership_id" UUID NOT NULL,
  "reviewed_by_membership_id" UUID,
  "review_comment" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "deletion_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "deletion_requests_organization_id_status_created_at_idx"
  ON "deletion_requests"("organization_id", "status", "created_at");
CREATE INDEX "deletion_requests_organization_id_entity_type_entity_id_idx"
  ON "deletion_requests"("organization_id", "entity_type", "entity_id");

ALTER TABLE "deletion_requests"
  ADD CONSTRAINT "deletion_requests_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "code", "description") VALUES
  (gen_random_uuid(), 'deletions:read', 'View pending deletion requests'),
  (gen_random_uuid(), 'deletions:request', 'Request permanent deletion of catalog and reference data'),
  (gen_random_uuid(), 'deletions:approve', 'Approve or reject deletion requests and permanently delete records')
ON CONFLICT ("code") DO NOTHING;

-- DIRECTOR: all new deletion permissions
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."code" = 'DIRECTOR'
  AND r."is_system" = true
  AND p."code" IN ('deletions:read', 'deletions:request', 'deletions:approve')
ON CONFLICT DO NOTHING;

-- FLORIST: can request deletion
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."code" = 'deletions:request'
WHERE r."code" = 'FLORIST'
  AND r."is_system" = true
ON CONFLICT DO NOTHING;

-- COURIER: can request deletion (e.g. couriers list)
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."code" = 'deletions:request'
WHERE r."code" = 'COURIER'
  AND r."is_system" = true
ON CONFLICT DO NOTHING;

-- DEVELOPER system role per organization
INSERT INTO "roles" ("id", "organization_id", "name", "code", "is_system", "status", "created_at", "updated_at")
SELECT gen_random_uuid(), o."id", 'Developer', 'DEVELOPER', true, 'ACTIVE', NOW(), NOW()
FROM "organizations" o
WHERE NOT EXISTS (
  SELECT 1 FROM "roles" r
  WHERE r."organization_id" = o."id" AND r."code" = 'DEVELOPER'
);

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."code" = 'DEVELOPER'
  AND r."is_system" = true
  AND p."code" IN (
    'organization:read',
    'users:read',
    'audit:read',
    'master-data:read',
    'customers:read',
    'deletions:read',
    'deletions:approve'
  )
ON CONFLICT DO NOTHING;
