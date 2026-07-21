import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { resolvePrismaClient } from '../../../infrastructure/persistence/prisma-transaction-context';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type {
  TransferAllocationView,
  TransferDocumentView,
  TransferItemView,
  TransferRepository,
  TransferTimelineEventView,
} from '../application/ports/transfer.repository';

@Injectable()
export class PrismaTransferRepository implements TransferRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get client() {
    return resolvePrismaClient(this.prisma);
  }

  async nextNumber(organizationId: string): Promise<string> {
    const count = await this.client.transferDocument.count({ where: { organizationId } });
    return `TRF-${String(count + 1).padStart(5, '0')}`;
  }

  async createDocument(input: {
    id: string;
    organizationId: string;
    storeId: string;
    fromWarehouseId: string;
    toWarehouseId: string;
    number: string;
    comment?: string | null;
    createdByMembershipId: string | null;
  }): Promise<TransferDocumentView> {
    const row = await this.client.transferDocument.create({
      data: {
        ...input,
        comment: input.comment ?? null,
      },
      include: { items: true, allocations: true },
    });
    return mapDocument(row);
  }

  async getDocument(
    organizationId: string,
    storeId: string,
    transferId: string,
  ): Promise<TransferDocumentView | null> {
    const row = await this.client.transferDocument.findFirst({
      where: { id: transferId, organizationId, storeId },
      include: { items: true, allocations: true },
    });
    return row ? mapDocument(row) : null;
  }

  async listDocuments(organizationId: string, storeId: string): Promise<TransferDocumentView[]> {
    const rows = await this.client.transferDocument.findMany({
      where: { organizationId, storeId },
      include: { items: true, allocations: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(mapDocument);
  }

  async addItem(input: {
    id: string;
    organizationId: string;
    transferDocumentId: string;
    itemId: string;
    requestedQuantity: string;
  }): Promise<TransferItemView> {
    const row = await this.client.transferItem.create({
      data: {
        id: input.id,
        organizationId: input.organizationId,
        transferDocumentId: input.transferDocumentId,
        itemId: input.itemId,
        requestedQuantity: new Prisma.Decimal(input.requestedQuantity),
      },
    });
    return mapItem(row);
  }

  async updateDocument(
    organizationId: string,
    storeId: string,
    transferId: string,
    data: Record<string, unknown>,
    expectedVersion?: number,
  ): Promise<TransferDocumentView | null> {
    const where: Prisma.TransferDocumentWhereInput = { id: transferId, organizationId, storeId };
    if (expectedVersion !== undefined) where.version = expectedVersion;
    const existing = await this.client.transferDocument.findFirst({ where });
    if (!existing) return null;
    const row = await this.client.transferDocument.update({
      where: { id: transferId },
      data: {
        ...data,
        version: expectedVersion !== undefined ? expectedVersion + 1 : undefined,
        updatedAt: new Date(),
      },
      include: { items: true, allocations: true },
    });
    return mapDocument(row);
  }

  async listTimeline(organizationId: string, transferId: string): Promise<TransferTimelineEventView[]> {
    const rows = await this.client.transferTimelineEvent.findMany({
      where: { organizationId, transferDocumentId: transferId },
      orderBy: { occurredAt: 'asc' },
    });
    return rows as TransferTimelineEventView[];
  }

  async appendTimeline(input: {
    id: string;
    organizationId: string;
    transferDocumentId: string;
    type: string;
    message: string | null;
    actorMembershipId: string | null;
    payload: Record<string, unknown> | null;
    occurredAt: Date;
  }): Promise<TransferTimelineEventView> {
    const row = await this.client.transferTimelineEvent.create({
      data: {
        id: input.id,
        organizationId: input.organizationId,
        transferDocumentId: input.transferDocumentId,
        type: input.type as never,
        message: input.message,
        actorMembershipId: input.actorMembershipId,
        payload: (input.payload ?? undefined) as Prisma.InputJsonValue | undefined,
        occurredAt: input.occurredAt,
      },
    });
    return row as TransferTimelineEventView;
  }
}

function mapItem(row: {
  id: string;
  organizationId: string;
  transferDocumentId: string;
  itemId: string;
  requestedQuantity: Prisma.Decimal;
  dispatchedQuantity: Prisma.Decimal | null;
  receivedQuantity: Prisma.Decimal | null;
  damagedQuantity: Prisma.Decimal | null;
  createdAt: Date;
  updatedAt: Date;
}): TransferItemView {
  return {
    id: row.id,
    organizationId: row.organizationId,
    transferDocumentId: row.transferDocumentId,
    itemId: row.itemId,
    requestedQuantity: row.requestedQuantity.toString(),
    dispatchedQuantity: row.dispatchedQuantity?.toString() ?? null,
    receivedQuantity: row.receivedQuantity?.toString() ?? null,
    damagedQuantity: row.damagedQuantity?.toString() ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapAllocation(row: {
  id: string;
  organizationId: string;
  transferDocumentId: string;
  transferItemId: string;
  fromItemId: string;
  toItemId: string | null;
  batchId: string;
  quantityDispatched: Prisma.Decimal;
  quantityReceived: Prisma.Decimal | null;
  quantityDamaged: Prisma.Decimal | null;
  unitCost: Prisma.Decimal;
  createdAt: Date;
  updatedAt: Date;
}): TransferAllocationView {
  return {
    id: row.id,
    organizationId: row.organizationId,
    transferDocumentId: row.transferDocumentId,
    transferItemId: row.transferItemId,
    fromItemId: row.fromItemId,
    toItemId: row.toItemId,
    batchId: row.batchId,
    quantityDispatched: row.quantityDispatched.toString(),
    quantityReceived: row.quantityReceived?.toString() ?? null,
    quantityDamaged: row.quantityDamaged?.toString() ?? null,
    unitCost: row.unitCost.toString(),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapDocument(row: {
  id: string;
  organizationId: string;
  storeId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  number: string;
  status: string;
  version: number;
  dispatchedAt: Date | null;
  receivedAt: Date | null;
  cancelledAt: Date | null;
  reversedAt: Date | null;
  comment: string | null;
  createdByMembershipId: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: Array<Parameters<typeof mapItem>[0]>;
  allocations: Array<Parameters<typeof mapAllocation>[0]>;
}): TransferDocumentView {
  return {
    id: row.id,
    organizationId: row.organizationId,
    storeId: row.storeId,
    fromWarehouseId: row.fromWarehouseId,
    toWarehouseId: row.toWarehouseId,
    number: row.number,
    status: row.status as never,
    version: row.version,
    dispatchedAt: row.dispatchedAt,
    receivedAt: row.receivedAt,
    cancelledAt: row.cancelledAt,
    reversedAt: row.reversedAt,
    comment: row.comment,
    createdByMembershipId: row.createdByMembershipId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    items: row.items.map(mapItem),
    allocations: row.allocations.map(mapAllocation),
  };
}
