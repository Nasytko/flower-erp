import { Module } from '@nestjs/common';
import { OrganizationModule } from '../organization/organization.module';
import { InventoryCountUseCases } from './application/inventory-count.use-cases';
import { InventoryQueryUseCases } from './application/inventory-query.use-cases';
import { INVENTORY_COUNT_PORT } from './application/ports/inventory-count.port';
import { INVENTORY_ISSUE_PORT } from './application/ports/inventory-issue.port';
import { INVENTORY_POSTING_PORT } from './application/ports/inventory-posting.port';
import { INVENTORY_RESERVATION_PORT } from './application/ports/inventory-reservation.port';
import { INVENTORY_QUERY_REPOSITORY } from './application/ports/inventory-query.repository';
import { INVENTORY_TRANSFER_PORT } from './application/ports/inventory-transfer.port';
import { INVENTORY_WRITE_OFF_PORT } from './application/ports/inventory-write-off.port';
import { WriteOffUseCases } from './application/write-off.use-cases';
import { PrismaInventoryCountAdapter } from './infrastructure/prisma-inventory-count.adapter';
import { PrismaInventoryIssueAdapter } from './infrastructure/prisma-inventory-issue.adapter';
import { PrismaInventoryPostingAdapter } from './infrastructure/prisma-inventory-posting.adapter';
import { PrismaInventoryReservationAdapter } from './infrastructure/prisma-inventory-reservation.adapter';
import { PrismaInventoryQueryRepository } from './infrastructure/prisma-inventory-query.repository';
import { PrismaInventoryTransferAdapter } from './infrastructure/prisma-inventory-transfer.adapter';
import { PrismaInventoryWriteOffAdapter } from './infrastructure/prisma-inventory-write-off.adapter';
import { InventoryController } from './presentation/inventory.controller';
import { InventoryCountsController } from './presentation/inventory-counts.controller';
import { WriteOffsController } from './presentation/write-offs.controller';

@Module({
  imports: [OrganizationModule],
  controllers: [InventoryController, WriteOffsController, InventoryCountsController],
  providers: [
    InventoryQueryUseCases,
    WriteOffUseCases,
    InventoryCountUseCases,
    { provide: INVENTORY_QUERY_REPOSITORY, useClass: PrismaInventoryQueryRepository },
    { provide: INVENTORY_POSTING_PORT, useClass: PrismaInventoryPostingAdapter },
    { provide: INVENTORY_RESERVATION_PORT, useClass: PrismaInventoryReservationAdapter },
    { provide: INVENTORY_ISSUE_PORT, useClass: PrismaInventoryIssueAdapter },
    { provide: INVENTORY_WRITE_OFF_PORT, useClass: PrismaInventoryWriteOffAdapter },
    { provide: INVENTORY_TRANSFER_PORT, useClass: PrismaInventoryTransferAdapter },
    { provide: INVENTORY_COUNT_PORT, useClass: PrismaInventoryCountAdapter },
  ],
  exports: [
    INVENTORY_POSTING_PORT,
    INVENTORY_RESERVATION_PORT,
    INVENTORY_ISSUE_PORT,
    INVENTORY_WRITE_OFF_PORT,
    INVENTORY_TRANSFER_PORT,
    INVENTORY_COUNT_PORT,
    InventoryQueryUseCases,
    WriteOffUseCases,
    InventoryCountUseCases,
  ],
})
export class InventoryModule {}
