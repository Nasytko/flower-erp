import { Module } from '@nestjs/common';
import { OrganizationModule } from '../organization/organization.module';
import { MasterDataModule } from '../master-data/master-data.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ORDERS_DELIVERY_PORT } from '../delivery/application/ports/orders-delivery.port';
import { CustomerUseCases } from './application/customer.use-cases';
import { OrderUseCases } from './application/order.use-cases';
import { ORDER_REPOSITORY } from './application/ports/order.repository';
import { ORDERS_SALES_PORT } from './application/ports/orders-sales.port';
import { ORDERS_PAYMENT_PORT } from '../payments/application/ports/orders-payment.port';
import { PrismaOrderRepository } from './infrastructure/prisma-order.repository';
import { PrismaOrdersSalesAdapter } from './infrastructure/prisma-orders-sales.adapter';
import { PrismaOrdersPaymentAdapter } from './infrastructure/prisma-orders-payment.adapter';
import { PrismaOrdersDeliveryAdapter } from './infrastructure/prisma-orders-delivery.adapter';
import { OrdersController } from './presentation/orders.controller';
import { CustomersController } from './presentation/customers.controller';

@Module({
  imports: [OrganizationModule, MasterDataModule, InventoryModule],
  controllers: [OrdersController, CustomersController],
  providers: [
    CustomerUseCases,
    OrderUseCases,
    { provide: ORDER_REPOSITORY, useClass: PrismaOrderRepository },
    { provide: ORDERS_SALES_PORT, useClass: PrismaOrdersSalesAdapter },
    { provide: ORDERS_PAYMENT_PORT, useClass: PrismaOrdersPaymentAdapter },
    { provide: ORDERS_DELIVERY_PORT, useClass: PrismaOrdersDeliveryAdapter },
  ],
  exports: [
    CustomerUseCases,
    OrderUseCases,
    ORDERS_SALES_PORT,
    ORDERS_PAYMENT_PORT,
    ORDERS_DELIVERY_PORT,
  ],
})
export class OrdersModule {}
