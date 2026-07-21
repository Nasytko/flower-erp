-- CreateEnum
CREATE TYPE "MasterDataStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('FLOWER', 'MATERIAL');

-- CreateEnum
CREATE TYPE "TrackingMethod" AS ENUM ('LOT', 'NONE');

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "country" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "contact_person" TEXT,
    "comment" TEXT,
    "status" "MasterDataStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_categories" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "parent_id" UUID,
    "status" "MasterDataStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "item_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units_of_measure" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "status" "MasterDataStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "units_of_measure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_policies" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "item_type" "ItemType" NOT NULL,
    "tracking_method" "TrackingMethod" NOT NULL,
    "reservation_allowed" BOOLEAN NOT NULL DEFAULT false,
    "expiration_tracking" BOOLEAN NOT NULL,
    "allow_fractional_quantity" BOOLEAN NOT NULL DEFAULT false,
    "default_shelf_life_days" INTEGER,
    "status" "MasterDataStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "inventory_policy_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "item_type" "ItemType" NOT NULL,
    "description" TEXT,
    "status" "MasterDataStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "suppliers_organization_id_idx" ON "suppliers"("organization_id");

-- CreateIndex
CREATE INDEX "suppliers_organization_id_status_idx" ON "suppliers"("organization_id", "status");

-- CreateIndex
CREATE INDEX "suppliers_organization_id_name_idx" ON "suppliers"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_organization_id_code_key" ON "suppliers"("organization_id", "code");

-- CreateIndex
CREATE INDEX "item_categories_organization_id_idx" ON "item_categories"("organization_id");

-- CreateIndex
CREATE INDEX "item_categories_organization_id_status_idx" ON "item_categories"("organization_id", "status");

-- CreateIndex
CREATE INDEX "item_categories_parent_id_idx" ON "item_categories"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "item_categories_organization_id_code_key" ON "item_categories"("organization_id", "code");

-- CreateIndex
CREATE INDEX "units_of_measure_organization_id_idx" ON "units_of_measure"("organization_id");

-- CreateIndex
CREATE INDEX "units_of_measure_organization_id_status_idx" ON "units_of_measure"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "units_of_measure_organization_id_symbol_key" ON "units_of_measure"("organization_id", "symbol");

-- CreateIndex
CREATE INDEX "inventory_policies_organization_id_idx" ON "inventory_policies"("organization_id");

-- CreateIndex
CREATE INDEX "inventory_policies_organization_id_status_idx" ON "inventory_policies"("organization_id", "status");

-- CreateIndex
CREATE INDEX "inventory_policies_organization_id_item_type_idx" ON "inventory_policies"("organization_id", "item_type");

-- CreateIndex
CREATE INDEX "items_organization_id_idx" ON "items"("organization_id");

-- CreateIndex
CREATE INDEX "items_organization_id_status_idx" ON "items"("organization_id", "status");

-- CreateIndex
CREATE INDEX "items_organization_id_item_type_idx" ON "items"("organization_id", "item_type");

-- CreateIndex
CREATE INDEX "items_organization_id_category_id_idx" ON "items"("organization_id", "category_id");

-- CreateIndex
CREATE INDEX "items_organization_id_name_idx" ON "items"("organization_id", "name");

-- CreateIndex
CREATE INDEX "items_unit_id_idx" ON "items"("unit_id");

-- CreateIndex
CREATE INDEX "items_inventory_policy_id_idx" ON "items"("inventory_policy_id");

-- CreateIndex
CREATE UNIQUE INDEX "items_organization_id_code_key" ON "items"("organization_id", "code");

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_categories" ADD CONSTRAINT "item_categories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_categories" ADD CONSTRAINT "item_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "item_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units_of_measure" ADD CONSTRAINT "units_of_measure_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_policies" ADD CONSTRAINT "inventory_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "item_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units_of_measure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_inventory_policy_id_fkey" FOREIGN KEY ("inventory_policy_id") REFERENCES "inventory_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
