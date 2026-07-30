import { Module } from '@nestjs/common';
import { OrganizationModule } from '../organization/organization.module';
import { MasterDataController } from './presentation/master-data.controller';
import { SupplierUseCases } from './application/supplier.use-cases';
import { CategoryUseCases } from './application/category.use-cases';
import { PolicyUseCases } from './application/policy.use-cases';
import { ItemUseCases } from './application/item.use-cases';
import { SeedDefaultMasterDataUseCases } from './application/seed-default-master-data.use-cases';
import { RetailPriceUseCases } from './application/retail-price.use-cases';
import {
  INVENTORY_POLICY_REPOSITORY,
  ITEM_CATEGORY_REPOSITORY,
  ITEM_REPOSITORY,
  SUPPLIER_REPOSITORY,
  UNIT_OF_MEASURE_REPOSITORY,
} from './application/ports/repositories';
import { ITEM_RETAIL_PRICE_REPOSITORY } from './application/ports/item-retail-price.repository';
import { ITEM_RECIPE_REPOSITORY } from './application/ports/item-recipe.repository';
import { PrismaItemRetailPriceRepository } from './infrastructure/prisma-item-retail-price.repository';
import { PrismaItemRecipeRepository } from './infrastructure/prisma-item-recipe.repository';
import { PrismaSupplierRepository } from './infrastructure/prisma-supplier.repository';
import { PrismaItemCategoryRepository } from './infrastructure/prisma-item-category.repository';
import { PrismaUnitOfMeasureRepository } from './infrastructure/prisma-unit-of-measure.repository';
import { PrismaInventoryPolicyRepository } from './infrastructure/prisma-inventory-policy.repository';
import { PrismaItemRepository } from './infrastructure/prisma-item.repository';

@Module({
  imports: [OrganizationModule],
  controllers: [MasterDataController],
  providers: [
    SupplierUseCases,
    CategoryUseCases,
    PolicyUseCases,
    ItemUseCases,
    RetailPriceUseCases,
    SeedDefaultMasterDataUseCases,
    { provide: SUPPLIER_REPOSITORY, useClass: PrismaSupplierRepository },
    { provide: ITEM_CATEGORY_REPOSITORY, useClass: PrismaItemCategoryRepository },
    { provide: UNIT_OF_MEASURE_REPOSITORY, useClass: PrismaUnitOfMeasureRepository },
    { provide: INVENTORY_POLICY_REPOSITORY, useClass: PrismaInventoryPolicyRepository },
    { provide: ITEM_REPOSITORY, useClass: PrismaItemRepository },
    { provide: ITEM_RETAIL_PRICE_REPOSITORY, useClass: PrismaItemRetailPriceRepository },
    { provide: ITEM_RECIPE_REPOSITORY, useClass: PrismaItemRecipeRepository },
  ],
  exports: [
    SupplierUseCases,
    CategoryUseCases,
    PolicyUseCases,
    ItemUseCases,
    RetailPriceUseCases,
    SeedDefaultMasterDataUseCases,
  ],
})
export class MasterDataModule {}
