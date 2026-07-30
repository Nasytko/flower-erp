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

function mapItem(row: PrismaItem, createdByDisplayName: string | null): ItemProps {
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
    isShowcase: row.isShowcase,
    minimumStockQuantity: row.minimumStockQuantity?.toString() ?? null,
    status: row.status as MasterDataStatus,
    createdByMembershipId: row.createdByMembershipId,
    createdByDisplayName,
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

  private async resolveDisplayNames(
    membershipIds: Array<string | null | undefined>,
  ): Promise<Map<string, string>> {
    const unique = [
      ...new Set(membershipIds.filter((id): id is string => Boolean(id))),
    ];
    if (unique.length === 0) {
      return new Map();
    }
    const rows = await this.client().organizationMembership.findMany({
      where: { id: { in: unique } },
      select: {
        id: true,
        user: { select: { displayName: true } },
      },
    });
    return new Map(rows.map((row) => [row.id, row.user.displayName]));
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
    isShowcase?: boolean;
    minimumStockQuantity?: string | null;
    status: MasterDataStatus;
    createdByMembershipId: string | null;
  }): Promise<ItemProps> {
    const row = await this.client().item.create({
      data: {
        ...data,
        isShowcase: data.isShowcase ?? false,
        minimumStockQuantity:
          data.minimumStockQuantity != null
            ? data.minimumStockQuantity
            : null,
      },
    });
    const names = await this.resolveDisplayNames([row.createdByMembershipId]);
    return mapItem(
      row,
      row.createdByMembershipId
        ? (names.get(row.createdByMembershipId) ?? null)
        : null,
    );
  }

  async findById(organizationId: string, id: string): Promise<ItemProps | null> {
    const row = await this.client().item.findFirst({
      where: { id, organizationId },
    });
    if (!row) {
      return null;
    }
    const names = await this.resolveDisplayNames([row.createdByMembershipId]);
    return mapItem(
      row,
      row.createdByMembershipId
        ? (names.get(row.createdByMembershipId) ?? null)
        : null,
    );
  }

  async findByIds(organizationId: string, ids: string[]): Promise<ItemProps[]> {
    if (ids.length === 0) {
      return [];
    }
    const unique = [...new Set(ids)];
    const rows = await this.client().item.findMany({
      where: { organizationId, id: { in: unique } },
    });
    const names = await this.resolveDisplayNames(rows.map((row) => row.createdByMembershipId));
    return rows.map((row) =>
      mapItem(
        row,
        row.createdByMembershipId
          ? (names.get(row.createdByMembershipId) ?? null)
          : null,
      ),
    );
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
    const names = await this.resolveDisplayNames(rows.map((row) => row.createdByMembershipId));
    return {
      items: rows.map((row) =>
        mapItem(
          row,
          row.createdByMembershipId
            ? (names.get(row.createdByMembershipId) ?? null)
            : null,
        ),
      ),
      totalItems,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }

  async update(
    organizationId: string,
    id: string,
    data: {
      name?: string;
      description?: string | null;
      minimumStockQuantity?: string | null;
      isShowcase?: boolean;
    },
  ): Promise<ItemProps> {
    await this.client().item.updateMany({
      where: { id, organizationId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.minimumStockQuantity !== undefined
          ? { minimumStockQuantity: data.minimumStockQuantity }
          : {}),
        ...(data.isShowcase !== undefined ? { isShowcase: data.isShowcase } : {}),
      },
    });
    const row = await this.findById(organizationId, id);
    if (!row) {
      throw new Error('Item missing after update');
    }
    return row;
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
