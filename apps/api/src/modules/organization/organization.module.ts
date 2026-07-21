import { Module } from '@nestjs/common';
import { OrganizationController } from './presentation/organization.controller';
import { OrganizationUseCases } from './application/organization.use-cases';
import {
  ORGANIZATION_REPOSITORY,
  STORE_REPOSITORY,
  WAREHOUSE_REPOSITORY,
} from './application/ports/repositories';
import { PrismaOrganizationRepository } from './infrastructure/prisma-organization.repository';
import { PrismaStoreRepository } from './infrastructure/prisma-store.repository';
import { PrismaWarehouseRepository } from './infrastructure/prisma-warehouse.repository';

@Module({
  controllers: [OrganizationController],
  providers: [
    OrganizationUseCases,
    { provide: ORGANIZATION_REPOSITORY, useClass: PrismaOrganizationRepository },
    { provide: STORE_REPOSITORY, useClass: PrismaStoreRepository },
    { provide: WAREHOUSE_REPOSITORY, useClass: PrismaWarehouseRepository },
  ],
  exports: [
    OrganizationUseCases,
    ORGANIZATION_REPOSITORY,
    STORE_REPOSITORY,
    WAREHOUSE_REPOSITORY,
  ],
})
export class OrganizationModule {}
