import { Global, Module, forwardRef } from '@nestjs/common';
import type { ApiEnv } from '@flower/config';
import { OrganizationModule } from '../organization/organization.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { DELIVERY_FULFILLMENT_PORT } from '../orders/application/ports/delivery-fulfillment.port';
import { DELIVERY_READINESS_PORT } from '../orders/application/ports/delivery-readiness.port';
import { API_ENV } from '../../infrastructure/infrastructure.module';
import { DeliveryUseCases } from './application/delivery.use-cases';
import { DELIVERY_REPOSITORY } from './application/ports/delivery.repository';
import { GEOCODING_PORT } from './application/ports/geocoding.port';
import { ROUTING_PORT } from './application/ports/routing.port';
import { ExternalNavigationLinkAdapter } from './infrastructure/external-navigation-link.adapter';
import {
  ManualGeocodingAdapter,
  MockGeocodingAdapter,
} from './infrastructure/manual-geocoding.adapter';
import { NominatimGeocodingAdapter } from './infrastructure/nominatim-geocoding.adapter';
import { GeocodingResolver } from './infrastructure/geocoding-resolver';
import { PrismaDeliveryRepository } from './infrastructure/prisma-delivery.repository';
import { DeliveryController } from './presentation/delivery.controller';

function geocodingProvider(env: ApiEnv) {
  if (env.GEOCODING_PROVIDER === 'mock') return new MockGeocodingAdapter();
  if (env.GEOCODING_PROVIDER === 'manual') return new ManualGeocodingAdapter();
  return new NominatimGeocodingAdapter(env);
}

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
    GeocodingResolver,
    { provide: DELIVERY_REPOSITORY, useClass: PrismaDeliveryRepository },
    {
      provide: GEOCODING_PORT,
      useFactory: geocodingProvider,
      inject: [API_ENV],
    },
    { provide: ROUTING_PORT, useClass: ExternalNavigationLinkAdapter },
    { provide: DELIVERY_READINESS_PORT, useExisting: DeliveryUseCases },
    { provide: DELIVERY_FULFILLMENT_PORT, useExisting: DeliveryUseCases },
  ],
  exports: [DeliveryUseCases, DELIVERY_READINESS_PORT, DELIVERY_FULFILLMENT_PORT],
})
export class DeliveryModule {}
