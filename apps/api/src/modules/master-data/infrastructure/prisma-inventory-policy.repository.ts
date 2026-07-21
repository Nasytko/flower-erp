import { Injectable } from '@nestjs/common';
import type { InventoryPolicy as PrismaPolicy } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { resolvePrismaClient } from '../../../infrastructure/persistence/prisma-transaction-context';
import type {
  InventoryPolicyRepository,
  PaginatedResult,
  PaginationInput,
} from '../application/ports/repositories';
import {
  ItemType,
  InventoryPolicyPresetCode,
  MasterDataStatus,
  TrackingMethod,
  type InventoryPolicyProps,
} from '../domain/master-data-rules';

function mapPolicy(row: PrismaPolicy): InventoryPolicyProps {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    itemType: row.itemType as ItemType,
    trackingMethod: row.trackingMethod as TrackingMethod,
    reservationAllowed: row.reservationAllowed,
    expirationTracking: row.expirationTracking,
    defaultShelfLifeDays: row.defaultShelfLifeDays,
    presetCode: row.presetCode as InventoryPolicyPresetCode | null,
    status: row.status as MasterDataStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class PrismaInventoryPolicyRepository implements InventoryPolicyRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client() {
    return resolvePrismaClient(this.prisma);
  }

  async create(data: {
    id: string;
    organizationId: string;
    name: string;
    itemType: ItemType;
    trackingMethod: TrackingMethod;
    reservationAllowed: boolean;
    expirationTracking: boolean;
    defaultShelfLifeDays: number | null;
    presetCode: InventoryPolicyPresetCode | null;
    status: MasterDataStatus;
  }): Promise<InventoryPolicyProps> {
    const row = await this.client().inventoryPolicy.create({ data });
    return mapPolicy(row);
  }

  async findById(organizationId: string, id: string): Promise<InventoryPolicyProps | null> {
    const row = await this.client().inventoryPolicy.findFirst({
      where: { id, organizationId },
    });
    return row ? mapPolicy(row) : null;
  }

  async list(
    organizationId: string,
    pagination: PaginationInput,
  ): Promise<PaginatedResult<InventoryPolicyProps>> {
    const where = { organizationId };
    const skip = (pagination.page - 1) * pagination.pageSize;
    const [totalItems, rows] = await Promise.all([
      this.client().inventoryPolicy.count({ where }),
      this.client().inventoryPolicy.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pagination.pageSize,
      }),
    ]);
    return {
      items: rows.map(mapPolicy),
      totalItems,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }

  async updateStatus(
    organizationId: string,
    id: string,
    status: MasterDataStatus,
  ): Promise<InventoryPolicyProps> {
    await this.client().inventoryPolicy.updateMany({
      where: { id, organizationId },
      data: { status },
    });
    const row = await this.findById(organizationId, id);
    if (!row) {
      throw new Error('Policy missing after status update');
    }
    return row;
  }

  async countItems(organizationId: string, policyId: string): Promise<number> {
    return this.client().item.count({
      where: {
        organizationId,
        inventoryPolicyId: policyId,
        status: { not: MasterDataStatus.ARCHIVED },
      },
    });
  }

  async findByPresetCode(
    organizationId: string,
    presetCode: InventoryPolicyPresetCode,
  ): Promise<InventoryPolicyProps | null> {
    const row = await this.client().inventoryPolicy.findFirst({
      where: { organizationId, presetCode },
    });
    return row ? mapPolicy(row) : null;
  }
}
