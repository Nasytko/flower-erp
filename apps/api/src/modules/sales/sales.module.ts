import { Module } from '@nestjs/common';
import { OrganizationModule } from '../organization/organization.module';
import { MasterDataModule } from '../master-data/master-data.module';
import { InventoryModule } from '../inventory/inventory.module';
import { OrdersModule } from '../orders/orders.module';
import { SaleUseCases } from './application/sale.use-cases';
import { SALES_PAYMENT_PORT } from '../payments/application/ports/sales-payment.port';
import { SALE_REPOSITORY } from './application/ports/sale.repository';
import { PrismaSaleRepository } from './infrastructure/prisma-sale.repository';
import { PrismaSalesPaymentAdapter } from './infrastructure/prisma-sales-payment.adapter';
import { SalesController } from './presentation/sales.controller';

@Module({
  imports: [OrganizationModule, MasterDataModule, InventoryModule, OrdersModule],
  controllers: [SalesController],
  providers: [
    SaleUseCases,
    { provide: SALE_REPOSITORY, useClass: PrismaSaleRepository },
    { provide: SALES_PAYMENT_PORT, useClass: PrismaSalesPaymentAdapter },
  ],
  exports: [SaleUseCases, SALES_PAYMENT_PORT],
})
export class SalesModule {}
