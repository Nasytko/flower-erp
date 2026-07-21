import { Injectable } from '@nestjs/common';
import type { UnitOfMeasure as PrismaUnit } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { resolvePrismaClient } from '../../../infrastructure/persistence/prisma-transaction-context';
import type {
  PaginatedResult,
  PaginationInput,
  UnitOfMeasureRepository,
} from '../application/ports/repositories';
import {
  MasterDataStatus,
  type UnitOfMeasureProps,
} from '../domain/master-data-rules';

function mapUnit(row: PrismaUnit): UnitOfMeasureProps {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    symbol: row.symbol,
    quantityScale: row.quantityScale,
    status: row.status as MasterDataStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class PrismaUnitOfMeasureRepository implements UnitOfMeasureRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client() {
    return resolvePrismaClient(this.prisma);
  }

  async create(data: {
    id: string;
    organizationId: string;
    name: string;
    symbol: string;
    quantityScale: number;
    status: MasterDataStatus;
  }): Promise<UnitOfMeasureProps> {
    const row = await this.client().unitOfMeasure.create({ data });
    return mapUnit(row);
  }

  async findById(organizationId: string, id: string): Promise<UnitOfMeasureProps | null> {
    const row = await this.client().unitOfMeasure.findFirst({
      where: { id, organizationId },
    });
    return row ? mapUnit(row) : null;
  }

  async list(
    organizationId: string,
    pagination: PaginationInput,
  ): Promise<PaginatedResult<UnitOfMeasureProps>> {
    const where = { organizationId };
    const skip = (pagination.page - 1) * pagination.pageSize;
    const [totalItems, rows] = await Promise.all([
      this.client().unitOfMeasure.count({ where }),
      this.client().unitOfMeasure.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take: pagination.pageSize,
      }),
    ]);
    return {
      items: rows.map(mapUnit),
      totalItems,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }

  async updateStatus(
    organizationId: string,
    id: string,
    status: MasterDataStatus,
  ): Promise<UnitOfMeasureProps> {
    await this.client().unitOfMeasure.updateMany({
      where: { id, organizationId },
      data: { status },
    });
    const row = await this.findById(organizationId, id);
    if (!row) {
      throw new Error('Unit missing after status update');
    }
    return row;
  }

  async existsSymbol(organizationId: string, symbol: string): Promise<boolean> {
    const row = await this.client().unitOfMeasure.findFirst({
      where: { organizationId, symbol },
      select: { id: true },
    });
    return Boolean(row);
  }

  async countItems(organizationId: string, unitId: string): Promise<number> {
    return this.client().item.count({
      where: {
        organizationId,
        unitId,
        status: { not: MasterDataStatus.ARCHIVED },
      },
    });
  }
}
