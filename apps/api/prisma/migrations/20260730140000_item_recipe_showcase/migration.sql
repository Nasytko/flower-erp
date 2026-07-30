BEGIN;

-- AlterTable
ALTER TABLE "items" ADD COLUMN "is_showcase" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "items_organization_id_is_showcase_idx" ON "items"("organization_id", "is_showcase");

-- CreateTable
CREATE TABLE "item_recipe_lines" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "parent_item_id" UUID NOT NULL,
    "component_item_id" UUID NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "item_recipe_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "item_recipe_lines_parent_item_id_component_item_id_key" ON "item_recipe_lines"("parent_item_id", "component_item_id");

-- CreateIndex
CREATE INDEX "item_recipe_lines_organization_id_idx" ON "item_recipe_lines"("organization_id");

-- CreateIndex
CREATE INDEX "item_recipe_lines_organization_id_parent_item_id_idx" ON "item_recipe_lines"("organization_id", "parent_item_id");

-- CreateIndex
CREATE INDEX "item_recipe_lines_component_item_id_idx" ON "item_recipe_lines"("component_item_id");

-- AddForeignKey
ALTER TABLE "item_recipe_lines" ADD CONSTRAINT "item_recipe_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_recipe_lines" ADD CONSTRAINT "item_recipe_lines_parent_item_id_fkey" FOREIGN KEY ("parent_item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_recipe_lines" ADD CONSTRAINT "item_recipe_lines_component_item_id_fkey" FOREIGN KEY ("component_item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
