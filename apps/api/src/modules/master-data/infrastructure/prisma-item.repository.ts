import { Injectable } from '@nestjs/common';
import type { Item as PrismaItem, Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { resolvePrismaClient } from '../../../infrastructure/persistence/prisma-transaction-context';
import type {
  ItemListFilter,
  ItemRepository,
  PaginatedResult,
  PaginationInput,
} from '../application/ports/repositories';
import {
  ItemType,
  MasterDataStatus,
  type ItemProps,
} from '../domain/master-data-rules';

function mapItem(row: PrismaItem): ItemProps {
  return {
    id: row.id,
    organizationId: row.organizationId,
    categoryId: row.categoryId,
    unitId: row.unitId,
    inventoryPolicyId: row.inventoryPolicyId,
    name: row.name,
    code: row.code,
    itemType: row.itemType as ItemType,
    description: row.description,
    isPurchasable: row.isPurchasable,
    isSellable: row.isSellable,
    status: row.status as MasterDataStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class PrismaItemRepository implements ItemRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client() {
    return resolvePrismaClient(this.prisma);
  }

  async create(data: {
    id: string;
    organizationId: string;
    categoryId: string;
    unitId: string;
    inventoryPolicyId: string;
    name: string;
    code: string;
    itemType: ItemType;
    description: string | null;
    isPurchasable: boolean;
    isSellable: boolean;
    status: MasterDataStatus;
  }): Promise<ItemProps> {
    const row = await this.client().item.create({ data });
    return mapItem(row);
  }

  async findById(organizationId: string, id: string): Promise<ItemProps | null> {
    const row = await this.client().item.findFirst({
      where: { id, organizationId },
    });
    return row ? mapItem(row) : null;
  }

  async list(
    organizationId: string,
    pagination: PaginationInput,
    filter: ItemListFilter,
  ): Promise<PaginatedResult<ItemProps>> {
    const where: Prisma.ItemWhereInput = {
      organizationId,
      ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
      ...(filter.itemType ? { itemType: filter.itemType } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.name ? { name: { contains: filter.name, mode: 'insensitive' } } : {}),
      ...(filter.code ? { code: { contains: filter.code.toUpperCase(), mode: 'insensitive' } } : {}),
    };
    const sortBy = filter.sortBy ?? 'createdAt';
    const sortDir = filter.sortDir ?? 'desc';
    const skip = (pagination.page - 1) * pagination.pageSize;
    const [totalItems, rows] = await Promise.all([
      this.client().item.count({ where }),
      this.client().item.findMany({
        where,
        orderBy: { [sortBy]: sortDir },
        skip,
        take: pagination.pageSize,
      }),
    ]);
    return {
      items: rows.map(mapItem),
      totalItems,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }

  async updateStatus(
    organizationId: string,
    id: string,
    status: MasterDataStatus,
  ): Promise<ItemProps> {
    await this.client().item.updateMany({
      where: { id, organizationId },
      data: { status },
    });
    const row = await this.findById(organizationId, id);
    if (!row) {
      throw new Error('Item missing after status update');
    }
    return row;
  }

  async existsCode(organizationId: string, code: string): Promise<boolean> {
    const row = await this.client().item.findFirst({
      where: { organizationId, code },
      select: { id: true },
    });
    return Boolean(row);
  }
}
