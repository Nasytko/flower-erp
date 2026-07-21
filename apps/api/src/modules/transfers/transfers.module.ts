import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { MasterDataModule } from '../master-data/master-data.module';
import { OrganizationModule } from '../organization/organization.module';
import { TransferUseCases } from './application/transfer.use-cases';
import { TRANSFER_REPOSITORY } from './application/ports/transfer.repository';
import { PrismaTransferRepository } from './infrastructure/prisma-transfer.repository';
import { TransfersController } from './presentation/transfers.controller';

@Module({
  imports: [OrganizationModule, MasterDataModule, InventoryModule],
  controllers: [TransfersController],
  providers: [
    TransferUseCases,
    { provide: TRANSFER_REPOSITORY, useClass: PrismaTransferRepository },
  ],
  exports: [TransferUseCases],
})
export class TransfersModule {}
