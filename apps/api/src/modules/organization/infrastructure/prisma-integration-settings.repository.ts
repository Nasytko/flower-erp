import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type {
  IntegrationSettingsRecord,
  IntegrationSettingsRepository,
  UpsertIntegrationSettingsInput,
} from '../application/ports/integration-settings.repository';

@Injectable()
export class PrismaIntegrationSettingsRepository implements IntegrationSettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByOrganizationId(organizationId: string): Promise<IntegrationSettingsRecord | null> {
    const row = await this.prisma.organizationIntegrationSettings.findUnique({
      where: { organizationId },
    });
    return row ? this.map(row) : null;
  }

  async upsert(input: UpsertIntegrationSettingsInput): Promise<IntegrationSettingsRecord> {
    const row = await this.prisma.organizationIntegrationSettings.upsert({
      where: { organizationId: input.organizationId },
      create: {
        organizationId: input.organizationId,
        geocodingProvider: input.geocodingProvider,
        yandexMapsApiKey: input.yandexMapsApiKey ?? null,
        navigationProvider: input.navigationProvider,
        mapDefaultLatitude: input.mapDefaultLatitude ?? null,
        mapDefaultLongitude: input.mapDefaultLongitude ?? null,
      },
      update: {
        geocodingProvider: input.geocodingProvider,
        yandexMapsApiKey:
          input.yandexMapsApiKey === undefined ? undefined : input.yandexMapsApiKey,
        navigationProvider: input.navigationProvider,
        mapDefaultLatitude: input.mapDefaultLatitude ?? null,
        mapDefaultLongitude: input.mapDefaultLongitude ?? null,
      },
    });
    return this.map(row);
  }

  private map(row: {
    organizationId: string;
    geocodingProvider: string;
    yandexMapsApiKey: string | null;
    navigationProvider: string;
    mapDefaultLatitude: string | null;
    mapDefaultLongitude: string | null;
    updatedAt: Date;
  }): IntegrationSettingsRecord {
    return {
      organizationId: row.organizationId,
      geocodingProvider: row.geocodingProvider,
      yandexMapsApiKey: row.yandexMapsApiKey,
      navigationProvider: row.navigationProvider,
      mapDefaultLatitude: row.mapDefaultLatitude,
      mapDefaultLongitude: row.mapDefaultLongitude,
      updatedAt: row.updatedAt,
    };
  }
}
