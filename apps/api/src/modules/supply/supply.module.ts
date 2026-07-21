import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { MasterDataModule } from '../master-data/master-data.module';
import { OrganizationModule } from '../organization/organization.module';
import { GoodsReceiptUseCases, SupplyUseCases } from './application/supply.use-cases';
import { SUPPLY_REPOSITORY } from './application/ports/supply.repository';
import { PrismaSupplyRepository } from './infrastructure/prisma-supply.repository';
import { SupplyController } from './presentation/supply.controller';

@Module({
  imports: [OrganizationModule, MasterDataModule, InventoryModule],
  controllers: [SupplyController],
  providers: [
    SupplyUseCases,
    GoodsReceiptUseCases,
    { provide: SUPPLY_REPOSITORY, useClass: PrismaSupplyRepository },
  ],
  exports: [SupplyUseCases, GoodsReceiptUseCases],
})
export class SupplyModule {}
