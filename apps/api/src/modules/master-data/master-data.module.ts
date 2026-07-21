import { Module } from '@nestjs/common';
import { OrganizationModule } from '../organization/organization.module';
import { MasterDataController } from './presentation/master-data.controller';
import { SupplierUseCases } from './application/supplier.use-cases';
import { CategoryUseCases } from './application/category.use-cases';
import { UnitUseCases } from './application/unit.use-cases';
import { PolicyUseCases } from './application/policy.use-cases';
import { ItemUseCases } from './application/item.use-cases';
import { SeedDefaultMasterDataUseCases } from './application/seed-default-master-data.use-cases';
import {
  INVENTORY_POLICY_REPOSITORY,
  ITEM_CATEGORY_REPOSITORY,
  ITEM_REPOSITORY,
  SUPPLIER_REPOSITORY,
  UNIT_OF_MEASURE_REPOSITORY,
} from './application/ports/repositories';
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
    UnitUseCases,
    PolicyUseCases,
    ItemUseCases,
    SeedDefaultMasterDataUseCases,
    { provide: SUPPLIER_REPOSITORY, useClass: PrismaSupplierRepository },
    { provide: ITEM_CATEGORY_REPOSITORY, useClass: PrismaItemCategoryRepository },
    { provide: UNIT_OF_MEASURE_REPOSITORY, useClass: PrismaUnitOfMeasureRepository },
    { provide: INVENTORY_POLICY_REPOSITORY, useClass: PrismaInventoryPolicyRepository },
    { provide: ITEM_REPOSITORY, useClass: PrismaItemRepository },
  ],
  exports: [
    SupplierUseCases,
    CategoryUseCases,
    UnitUseCases,
    PolicyUseCases,
    ItemUseCases,
    SeedDefaultMasterDataUseCases,
  ],
})
export class MasterDataModule {}
