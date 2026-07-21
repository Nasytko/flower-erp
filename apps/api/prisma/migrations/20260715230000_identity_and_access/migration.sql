-- Identity & Access models + permission seed

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'BLOCKED', 'ARCHIVED');
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');
CREATE TYPE "RoleStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "StoreAccessMode" AS ENUM ('ALL_STORES', 'SELECTED_STORES');
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "login" TEXT NOT NULL,
    "email" TEXT,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "password_changed_at" TIMESTAMP(3) NOT NULL,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "organization_memberships" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "store_access_mode" "StoreAccessMode" NOT NULL DEFAULT 'ALL_STORES',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "status" "RoleStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

CREATE TABLE "membership_roles" (
    "membership_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,

    CONSTRAINT "membership_roles_pkey" PRIMARY KEY ("membership_id","role_id")
);

CREATE TABLE "user_store_access" (
    "id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_store_access_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "revoke_reason" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "last_used_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- Seed permissions from registry (stable UUIDs for idempotency in role wiring)
INSERT INTO "permissions" ("id", "code", "description") VALUES
  ('00000000-0000-4000-8000-000000000001', 'organization:read', 'View organization profile and list accessible organizations'),
  ('00000000-0000-4000-8000-000000000002', 'organization:manage', 'Create and archive organizations'),
  ('00000000-0000-4000-8000-000000000003', 'stores:read', 'View stores and warehouses in scope'),
  ('00000000-0000-4000-8000-000000000004', 'stores:create', 'Create stores and default warehouses'),
  ('00000000-0000-4000-8000-000000000005', 'stores:archive', 'Archive stores'),
  ('00000000-0000-4000-8000-000000000006', 'master-data:read', 'View master data'),
  ('00000000-0000-4000-8000-000000000007', 'master-data:manage', 'Create and archive master data'),
  ('00000000-0000-4000-8000-000000000008', 'supply:read', 'View supplies and goods receipts'),
  ('00000000-0000-4000-8000-000000000009', 'supply:create', 'Create and edit draft supplies'),
  ('00000000-0000-4000-8000-00000000000a', 'supply:submit', 'Submit supplies to supplier'),
  ('00000000-0000-4000-8000-00000000000b', 'supply:receive', 'Create and post goods receipts'),
  ('00000000-0000-4000-8000-00000000000c', 'supply:reverse', 'Reverse posted goods receipts'),
  ('00000000-0000-4000-8000-00000000000d', 'inventory:read', 'View inventory balances, batches, and movements'),
  ('00000000-0000-4000-8000-00000000000e', 'inventory:view-cost', 'View purchase costs on inventory and receipts'),
  ('00000000-0000-4000-8000-00000000000f', 'audit:read', 'View audit log entries'),
  ('00000000-0000-4000-8000-000000000010', 'users:read', 'View organization users'),
  ('00000000-0000-4000-8000-000000000011', 'users:manage', 'Create, block, archive users and reset passwords'),
  ('00000000-0000-4000-8000-000000000012', 'roles:manage', 'Assign roles and store access');

-- CreateIndex
CREATE UNIQUE INDEX "users_login_key" ON "users"("login");
CREATE INDEX "users_status_idx" ON "users"("status");

CREATE UNIQUE INDEX "organization_memberships_organization_id_user_id_key" ON "organization_memberships"("organization_id", "user_id");
CREATE INDEX "organization_memberships_organization_id_idx" ON "organization_memberships"("organization_id");
CREATE INDEX "organization_memberships_user_id_idx" ON "organization_memberships"("user_id");
CREATE INDEX "organization_memberships_organization_id_status_idx" ON "organization_memberships"("organization_id", "status");

CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

CREATE UNIQUE INDEX "roles_organization_id_code_key" ON "roles"("organization_id", "code");
CREATE INDEX "roles_organization_id_idx" ON "roles"("organization_id");
CREATE INDEX "roles_organization_id_status_idx" ON "roles"("organization_id", "status");

CREATE UNIQUE INDEX "user_store_access_membership_id_store_id_key" ON "user_store_access"("membership_id", "store_id");
CREATE INDEX "user_store_access_membership_id_idx" ON "user_store_access"("membership_id");
CREATE INDEX "user_store_access_store_id_idx" ON "user_store_access"("store_id");

CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");
CREATE INDEX "sessions_user_id_status_idx" ON "sessions"("user_id", "status");
CREATE INDEX "sessions_family_id_idx" ON "sessions"("family_id");
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");
CREATE INDEX "sessions_refresh_token_hash_idx" ON "sessions"("refresh_token_hash");
CREATE INDEX "sessions_membership_id_idx" ON "sessions"("membership_id");

-- AddForeignKey
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "roles" ADD CONSTRAINT "roles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "organization_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "user_store_access" ADD CONSTRAINT "user_store_access_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "organization_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_store_access" ADD CONSTRAINT "user_store_access_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "organization_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
