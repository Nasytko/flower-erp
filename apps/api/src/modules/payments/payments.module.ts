import { Module } from '@nestjs/common';
import { OrganizationModule } from '../organization/organization.module';
import { OrdersModule } from '../orders/orders.module';
import { SalesModule } from '../sales/sales.module';
import { PAYMENTS_DELIVERY_READ_PORT } from './application/ports/payments-delivery-read.port';
import { PaymentUseCases } from './application/payment.use-cases';
import {
  NoopPaymentDependencyAdapter,
  PAYMENT_DEPENDENCY_PORT,
} from './application/ports/payment-dependency.port';
import { PAYMENT_REPOSITORY } from './application/ports/payment.repository';
import { PrismaPaymentRepository } from './infrastructure/prisma-payment.repository';
import { PrismaPaymentsDeliveryReadAdapter } from './infrastructure/prisma-payments-delivery-read.adapter';
import { PaymentsController } from './presentation/payments.controller';

@Module({
  imports: [OrganizationModule, OrdersModule, SalesModule],
  controllers: [PaymentsController],
  providers: [
    PaymentUseCases,
    { provide: PAYMENT_REPOSITORY, useClass: PrismaPaymentRepository },
    { provide: PAYMENT_DEPENDENCY_PORT, useClass: NoopPaymentDependencyAdapter },
    { provide: PAYMENTS_DELIVERY_READ_PORT, useClass: PrismaPaymentsDeliveryReadAdapter },
  ],
  exports: [PaymentUseCases, PAYMENTS_DELIVERY_READ_PORT],
})
export class PaymentsModule {}
