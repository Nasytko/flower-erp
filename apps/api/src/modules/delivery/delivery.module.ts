import { Global, Module, forwardRef } from '@nestjs/common';
import { OrganizationModule } from '../organization/organization.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { DELIVERY_FULFILLMENT_PORT } from '../orders/application/ports/delivery-fulfillment.port';
import { DELIVERY_READINESS_PORT } from '../orders/application/ports/delivery-readiness.port';
import { DeliveryUseCases } from './application/delivery.use-cases';
import { DELIVERY_REPOSITORY } from './application/ports/delivery.repository';
import { GEOCODING_PORT } from './application/ports/geocoding.port';
import { ROUTING_PORT } from './application/ports/routing.port';
import { ExternalNavigationLinkAdapter } from './infrastructure/external-navigation-link.adapter';
import { ManualGeocodingAdapter } from './infrastructure/manual-geocoding.adapter';
import { PrismaDeliveryRepository } from './infrastructure/prisma-delivery.repository';
import { DeliveryController } from './presentation/delivery.controller';

/**
 * Global so Order MarkReady/fulfillment hooks resolve via ModuleRef
 * without OrdersModule importing DeliveryModule (breaks Nest cycles).
 */
@Global()
@Module({
  imports: [
    OrganizationModule,
    forwardRef(() => OrdersModule),
    forwardRef(() => PaymentsModule),
  ],
  controllers: [DeliveryController],
  providers: [
    DeliveryUseCases,
    { provide: DELIVERY_REPOSITORY, useClass: PrismaDeliveryRepository },
    { provide: GEOCODING_PORT, useClass: ManualGeocodingAdapter },
    { provide: ROUTING_PORT, useClass: ExternalNavigationLinkAdapter },
    { provide: DELIVERY_READINESS_PORT, useExisting: DeliveryUseCases },
    { provide: DELIVERY_FULFILLMENT_PORT, useExisting: DeliveryUseCases },
  ],
  exports: [DeliveryUseCases, DELIVERY_READINESS_PORT, DELIVERY_FULFILLMENT_PORT],
})
export class DeliveryModule {}
