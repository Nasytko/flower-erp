import { Module } from '@nestjs/common';
import { HealthController } from './presentation/health.controller';
import { HealthService } from './application/health.service';
import { DATABASE_HEALTH_PORT } from './application/ports/database-health.port';
import { PrismaDatabaseHealthAdapter } from './infrastructure/prisma-database-health.adapter';

/**
 * System module — operational endpoints (health). Not a business bounded context.
 */
@Module({
  controllers: [HealthController],
  providers: [
    HealthService,
    { provide: DATABASE_HEALTH_PORT, useClass: PrismaDatabaseHealthAdapter },
  ],
})
export class SystemModule {}
