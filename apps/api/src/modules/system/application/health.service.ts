import { Inject, Injectable } from '@nestjs/common';
import type { HealthLiveResponse, HealthReadyResponse } from '@flower/contracts';
import {
  DATABASE_HEALTH_PORT,
  type DatabaseHealthPort,
} from './ports/database-health.port';

@Injectable()
export class HealthService {
  constructor(
    @Inject(DATABASE_HEALTH_PORT)
    private readonly databaseHealth: DatabaseHealthPort,
  ) {}

  live(): HealthLiveResponse {
    return {
      status: 'ok',
      service: 'flower-erp-api',
      timestamp: new Date().toISOString(),
    };
  }

  async ready(): Promise<HealthReadyResponse> {
    const databaseUp = await this.databaseHealth.isReachable();
    return {
      status: databaseUp ? 'ok' : 'degraded',
      service: 'flower-erp-api',
      timestamp: new Date().toISOString(),
      checks: {
        database: databaseUp ? 'up' : 'down',
      },
    };
  }
}
