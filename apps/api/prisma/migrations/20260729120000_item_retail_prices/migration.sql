-- CreateEnum
CREATE TYPE "RetailPricingMode" AS ENUM ('UNIT', 'SERVICE');

-- CreateTable
CREATE TABLE "item_retail_prices" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "effective_from" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "pricing_mode" "RetailPricingMode" NOT NULL,
    "created_by_membership_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "item_retail_prices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "item_retail_prices_organization_id_item_id_effective_from_key" ON "item_retail_prices"("organization_id", "item_id", "effective_from");

-- CreateIndex
CREATE INDEX "item_retail_prices_organization_id_effective_from_idx" ON "item_retail_prices"("organization_id", "effective_from");

-- CreateIndex
CREATE INDEX "item_retail_prices_organization_id_item_id_idx" ON "item_retail_prices"("organization_id", "item_id");

-- AddForeignKey
ALTER TABLE "item_retail_prices" ADD CONSTRAINT "item_retail_prices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_retail_prices" ADD CONSTRAINT "item_retail_prices_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
