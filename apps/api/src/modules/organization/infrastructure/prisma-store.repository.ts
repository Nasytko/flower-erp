import { Injectable } from '@nestjs/common';
import type { Store as PrismaStore } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { resolvePrismaClient } from '../../../infrastructure/persistence/prisma-transaction-context';
import type {
  PaginatedResult,
  PaginationInput,
  StoreRepository,
} from '../application/ports/repositories';
import { StoreStatus, type StoreProps } from '../domain/organization-rules';

function mapStore(row: PrismaStore): StoreProps {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    code: row.code,
    address: row.address,
    timezone: row.timezone,
    status: row.status as StoreStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class PrismaStoreRepository implements StoreRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client() {
    return resolvePrismaClient(this.prisma);
  }

  async create(data: {
    id: string;
    organizationId: string;
    name: string;
    code: string;
    address: string | null;
    timezone: string;
    status: StoreStatus;
  }): Promise<StoreProps> {
    const row = await this.client().store.create({
      data: {
        id: data.id,
        organizationId: data.organizationId,
        name: data.name,
        code: data.code,
        address: data.address,
        timezone: data.timezone,
        status: data.status,
      },
    });
    return mapStore(row);
  }

  async findById(organizationId: string, storeId: string): Promise<StoreProps | null> {
    const row = await this.client().store.findFirst({
      where: { id: storeId, organizationId },
    });
    return row ? mapStore(row) : null;
  }

  async listByOrganization(
    organizationId: string,
    pagination: PaginationInput,
  ): Promise<PaginatedResult<StoreProps>> {
    const skip = (pagination.page - 1) * pagination.pageSize;
    const where = { organizationId };
    const [totalItems, rows] = await Promise.all([
      this.client().store.count({ where }),
      this.client().store.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pagination.pageSize,
      }),
    ]);
    return {
      items: rows.map(mapStore),
      totalItems,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }

  async updateStatus(
    organizationId: string,
    storeId: string,
    status: StoreStatus,
  ): Promise<StoreProps> {
    const existing = await this.findById(organizationId, storeId);
    if (!existing) {
      throw new Error('STORE_NOT_FOUND');
    }
    const row = await this.client().store.update({
      where: { id: storeId },
      data: { status },
    });
    return mapStore(row);
  }

  async existsCode(organizationId: string, code: string): Promise<boolean> {
    const count = await this.client().store.count({
      where: { organizationId, code },
    });
    return count > 0;
  }
}
