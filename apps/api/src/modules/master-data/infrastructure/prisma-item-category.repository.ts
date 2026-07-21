import { Injectable } from '@nestjs/common';
import type { ItemCategory as PrismaCategory } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { resolvePrismaClient } from '../../../infrastructure/persistence/prisma-transaction-context';
import type {
  ItemCategoryRepository,
  PaginatedResult,
  PaginationInput,
} from '../application/ports/repositories';
import {
  MasterDataStatus,
  type ItemCategoryProps,
} from '../domain/master-data-rules';

function mapCategory(row: PrismaCategory): ItemCategoryProps {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    code: row.code,
    parentId: row.parentId,
    status: row.status as MasterDataStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class PrismaItemCategoryRepository implements ItemCategoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client() {
    return resolvePrismaClient(this.prisma);
  }

  async create(data: {
    id: string;
    organizationId: string;
    name: string;
    code: string;
    parentId: string | null;
    status: MasterDataStatus;
  }): Promise<ItemCategoryProps> {
    const row = await this.client().itemCategory.create({ data });
    return mapCategory(row);
  }

  async findById(organizationId: string, id: string): Promise<ItemCategoryProps | null> {
    const row = await this.client().itemCategory.findFirst({
      where: { id, organizationId },
    });
    return row ? mapCategory(row) : null;
  }

  async list(
    organizationId: string,
    pagination: PaginationInput,
  ): Promise<PaginatedResult<ItemCategoryProps>> {
    const where = { organizationId };
    const skip = (pagination.page - 1) * pagination.pageSize;
    const [totalItems, rows] = await Promise.all([
      this.client().itemCategory.count({ where }),
      this.client().itemCategory.findMany({
        where,
        orderBy: [{ name: 'asc' }, { createdAt: 'desc' }],
        skip,
        take: pagination.pageSize,
      }),
    ]);
    return {
      items: rows.map(mapCategory),
      totalItems,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }

  async updateStatus(
    organizationId: string,
    id: string,
    status: MasterDataStatus,
  ): Promise<ItemCategoryProps> {
    await this.client().itemCategory.updateMany({
      where: { id, organizationId },
      data: { status },
    });
    const row = await this.findById(organizationId, id);
    if (!row) {
      throw new Error('Category missing after status update');
    }
    return row;
  }

  async existsCode(organizationId: string, code: string): Promise<boolean> {
    const row = await this.client().itemCategory.findFirst({
      where: { organizationId, code },
      select: { id: true },
    });
    return Boolean(row);
  }

  async countChildren(organizationId: string, parentId: string): Promise<number> {
    return this.client().itemCategory.count({
      where: {
        organizationId,
        parentId,
        status: { not: MasterDataStatus.ARCHIVED },
      },
    });
  }

  async countItems(organizationId: string, categoryId: string): Promise<number> {
    return this.client().item.count({
      where: {
        organizationId,
        categoryId,
        status: { not: MasterDataStatus.ARCHIVED },
      },
    });
  }

  async getParentId(organizationId: string, id: string): Promise<string | null> {
    const row = await this.client().itemCategory.findFirst({
      where: { id, organizationId },
      select: { parentId: true },
    });
    return row?.parentId ?? null;
  }
}
