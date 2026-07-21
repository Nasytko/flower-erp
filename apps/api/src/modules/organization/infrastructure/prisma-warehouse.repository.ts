import { Injectable } from '@nestjs/common';
import type { Warehouse as PrismaWarehouse } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { resolvePrismaClient } from '../../../infrastructure/persistence/prisma-transaction-context';
import type { WarehouseRepository } from '../application/ports/repositories';
import {
  WarehouseStatus,
  WarehouseType,
  type WarehouseProps,
} from '../domain/organization-rules';

function mapWarehouse(row: PrismaWarehouse): WarehouseProps {
  return {
    id: row.id,
    organizationId: row.organizationId,
    storeId: row.storeId,
    name: row.name,
    code: row.code,
    type: row.type as WarehouseType,
    isDefault: row.isDefault,
    status: row.status as WarehouseStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class PrismaWarehouseRepository implements WarehouseRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client() {
    return resolvePrismaClient(this.prisma);
  }

  async create(data: {
    id: string;
    organizationId: string;
    storeId: string;
    name: string;
    code: string;
    isDefault: boolean;
  }): Promise<WarehouseProps> {
    const row = await this.client().warehouse.create({
      data: {
        id: data.id,
        organizationId: data.organizationId,
        storeId: data.storeId,
        name: data.name,
        code: data.code,
        type: WarehouseType.STORE,
        isDefault: data.isDefault,
        status: WarehouseStatus.ACTIVE,
      },
    });
    return mapWarehouse(row);
  }

  async findById(
    organizationId: string,
    storeId: string,
    warehouseId: string,
  ): Promise<WarehouseProps | null> {
    const row = await this.client().warehouse.findFirst({
      where: { id: warehouseId, organizationId, storeId },
    });
    return row ? mapWarehouse(row) : null;
  }

  async listByStore(organizationId: string, storeId: string): Promise<WarehouseProps[]> {
    const rows = await this.client().warehouse.findMany({
      where: { organizationId, storeId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    return rows.map(mapWarehouse);
  }

  async hasDefault(storeId: string): Promise<boolean> {
    const count = await this.client().warehouse.count({
      where: { storeId, isDefault: true },
    });
    return count > 0;
  }
}
