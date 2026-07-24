import { Module } from '@nestjs/common';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { DeliveryModule } from './modules/delivery/delivery.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { MasterDataModule } from './modules/master-data/master-data.module';
import { OrdersModule } from './modules/orders/orders.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PlatformModule } from './modules/platform/platform.module';
import { SalesModule } from './modules/sales/sales.module';
import { SupplyModule } from './modules/supply/supply.module';
import { SystemModule } from './modules/system/system.module';
import { TransfersModule } from './modules/transfers/transfers.module';
import { InfrastructureModule } from './infrastructure/infrastructure.module';

@Module({
  imports: [
    InfrastructureModule,
    PlatformModule,
    OrganizationModule,
    MasterDataModule,
    SupplyModule,
    InventoryModule,
    OrdersModule,
    SalesModule,
    PaymentsModule,
    DeliveryModule,
    AnalyticsModule,
    TransfersModule,
    SystemModule,
  ],
})
export class AppModule {}
