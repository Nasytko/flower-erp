import { Module } from '@nestjs/common';
import { MasterDataModule } from '../master-data/master-data.module';
import { OrganizationModule } from '../organization/organization.module';
import { InventoryQueryUseCases } from './application/inventory-query.use-cases';
import { INVENTORY_ISSUE_PORT } from './application/ports/inventory-issue.port';
import { INVENTORY_POSTING_PORT } from './application/ports/inventory-posting.port';
import { INVENTORY_RESERVATION_PORT } from './application/ports/inventory-reservation.port';
import { INVENTORY_QUERY_REPOSITORY } from './application/ports/inventory-query.repository';
import { INVENTORY_WRITE_OFF_PORT } from './application/ports/inventory-write-off.port';
import { WriteOffUseCases } from './application/write-off.use-cases';
import { PrismaInventoryIssueAdapter } from './infrastructure/prisma-inventory-issue.adapter';
import { PrismaInventoryPostingAdapter } from './infrastructure/prisma-inventory-posting.adapter';
import { PrismaInventoryReservationAdapter } from './infrastructure/prisma-inventory-reservation.adapter';
import { PrismaInventoryQueryRepository } from './infrastructure/prisma-inventory-query.repository';
import { PrismaInventoryWriteOffAdapter } from './infrastructure/prisma-inventory-write-off.adapter';
import { InventoryController } from './presentation/inventory.controller';
import { WriteOffsController } from './presentation/write-offs.controller';

/**
 * Inventory bounded context.
 * Imports MasterDataModule so WriteOffUseCases can inject ItemUseCases
 * (sibling AppModule import of MasterData is not visible inside this module).
 */
@Module({
  imports: [OrganizationModule, MasterDataModule],
  controllers: [InventoryController, WriteOffsController],
  providers: [
    InventoryQueryUseCases,
    WriteOffUseCases,
    { provide: INVENTORY_QUERY_REPOSITORY, useClass: PrismaInventoryQueryRepository },
    { provide: INVENTORY_POSTING_PORT, useClass: PrismaInventoryPostingAdapter },
    { provide: INVENTORY_RESERVATION_PORT, useClass: PrismaInventoryReservationAdapter },
    { provide: INVENTORY_ISSUE_PORT, useClass: PrismaInventoryIssueAdapter },
    { provide: INVENTORY_WRITE_OFF_PORT, useClass: PrismaInventoryWriteOffAdapter },
  ],
  exports: [
    INVENTORY_POSTING_PORT,
    INVENTORY_RESERVATION_PORT,
    INVENTORY_ISSUE_PORT,
    INVENTORY_WRITE_OFF_PORT,
    InventoryQueryUseCases,
    WriteOffUseCases,
  ],
})
export class InventoryModule {}
