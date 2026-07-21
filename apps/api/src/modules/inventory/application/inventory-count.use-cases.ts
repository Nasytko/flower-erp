import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { CLOCK_PORT, type ClockPort } from '@flower/shared-kernel';
import { getRequestContext } from '../../../infrastructure/context/request-context';
import {
  getActivePrismaTx,
  type PrismaTransactionClient,
  resolvePrismaClient,
} from '../../../infrastructure/persistence/prisma-transaction-context';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../infrastructure/persistence/unit-of-work.port';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { OrganizationUseCases } from '../../organization/application/organization.use-cases';
import {
  InventoryOperationRuleError,
  reconcileCount,
  reconcileCountWithMovements,
} from '../domain/inventory-operations-rules';
import { signedMovementDelta } from '../domain/inventory-movement-delta';
import {
  INVENTORY_COUNT_PORT,
  type InventoryCountPort,
} from './ports/inventory-count.port';

@Injectable()
export class InventoryCountUseCases {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationUseCases,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(INVENTORY_COUNT_PORT) private readonly inventory: InventoryCountPort,
  ) {}

  async create(input: {
    organizationId: string;
    storeId: string;
    warehouseId: string;
    comment?: string | null;
  }) {
    await this.organizations.getWarehouse(input.organizationId, input.storeId, input.warehouseId);
    return this.uow.runInTransaction(async () => {
      const snapshot = await this.inventory.snapshotCount(
        input.organizationId,
        input.storeId,
        input.warehouseId,
      );
      const client = getActivePrismaTx() ?? this.prisma;
      const cutoffAt = this.clock.now();
      const doc = await client.inventoryCount.create({
        data: {
          id: randomUUID(),
          organizationId: input.organizationId,
          storeId: input.storeId,
          warehouseId: input.warehouseId,
          number: await this.nextNumber(input.organizationId),
          cutoffAt,
          comment: input.comment ?? null,
          createdByMembershipId: actorMembershipId(),
          items: {
            create: snapshot.map((row) => ({
              id: randomUUID(),
              organizationId: input.organizationId,
              itemId: row.itemId,
              expectedQuantity: new Prisma.Decimal(row.expectedQuantity),
            })),
          },
        },
        include: { items: true },
      });
      return doc;
    });
  }

  async list(organizationId: string, storeId: string) {
    await this.organizations.getStore(organizationId, storeId);
    const client = resolvePrismaClient(this.prisma);
    return client.inventoryCount.findMany({
      where: { organizationId, storeId },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(organizationId: string, storeId: string, inventoryCountId: string) {
    return this.requireDoc(organizationId, storeId, inventoryCountId);
  }

  async count(input: {
    organizationId: string;
    storeId: string;
    inventoryCountId: string;
    expectedVersion: number;
    items: Array<{ inventoryCountItemId: string; countedQuantity: string }>;
  }) {
    return this.uow.runInTransaction(async () => {
      const doc = await this.requireDoc(input.organizationId, input.storeId, input.inventoryCountId);
      if (doc.status === 'POSTED' || doc.status === 'CANCELLED') {
        throw new ConflictException({ code: 'COUNT_NOT_EDITABLE', message: 'Count is no longer editable' });
      }
      if (doc.version !== input.expectedVersion) {
        throw new ConflictException({
          code: 'VERSION_CONFLICT',
          message: 'Inventory count version conflict; reload and retry',
          version: doc.version,
          updatedAt: doc.updatedAt,
        });
      }

      const client = getActivePrismaTx() ?? this.prisma;
      for (const line of input.items) {
        try {
          const current = doc.items.find((item) => item.id === line.inventoryCountItemId);
          if (!current) {
            throw new NotFoundException({ code: 'COUNT_ITEM_NOT_FOUND', message: 'Count item not found' });
          }
          const result = reconcileCount(current.expectedQuantity.toString(), line.countedQuantity);
          await client.inventoryCountItem.update({
            where: { id: line.inventoryCountItemId },
            data: {
              countedQuantity: new Prisma.Decimal(result.countedQuantity),
              varianceQuantity: new Prisma.Decimal(result.varianceQuantity),
            },
          });
        } catch (error) {
          mapRuleError(error);
        }
      }

      await client.inventoryCount.update({
        where: { id: doc.id },
        data: {
          status: 'COUNTED',
          countedAt: this.clock.now(),
          version: { increment: 1 },
        },
      });
      return this.requireDoc(input.organizationId, input.storeId, input.inventoryCountId);
    });
  }

  async post(input: {
    organizationId: string;
    storeId: string;
    inventoryCountId: string;
    expectedVersion: number;
    idempotencyKey: string;
  }) {
    if (!input.idempotencyKey?.trim()) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key header is required',
      });
    }
    return this.uow.runInTransaction(async () => {
      const doc = await this.requireDoc(input.organizationId, input.storeId, input.inventoryCountId);
      if (doc.status === 'POSTED') return doc;
      if (doc.status !== 'COUNTED') {
        throw new ConflictException({ code: 'COUNT_NOT_READY', message: 'Count must be COUNTED before posting' });
      }
      if (doc.version !== input.expectedVersion) {
        throw new ConflictException({
          code: 'VERSION_CONFLICT',
          message: 'Inventory count version conflict; reload and retry',
          version: doc.version,
          updatedAt: doc.updatedAt,
        });
      }

      const client = getActivePrismaTx() ?? this.prisma;
      const lines = [];
      for (const item of doc.items) {
        const netMovements = await this.netMovementsAfterCutoff(client, doc, item.itemId);
        const result = reconcileCountWithMovements(
          item.expectedQuantity.toString(),
          netMovements,
          item.countedQuantity?.toString() ?? item.expectedQuantity.toString(),
        );
        if (!result.movementType) continue;
        lines.push({
          inventoryCountItemId: item.id,
          itemId: item.itemId,
          varianceQuantity: result.varianceQuantity,
          movementType: result.movementType,
        });
      }

      await this.inventory.postInventoryCount({
        organizationId: doc.organizationId,
        storeId: doc.storeId,
        warehouseId: doc.warehouseId,
        inventoryCountId: doc.id,
        occurredAt: this.clock.now(),
        idempotencyKey: input.idempotencyKey,
        lines,
      });

      await client.inventoryCount.update({
        where: { id: doc.id },
        data: {
          status: 'POSTED',
          postedAt: this.clock.now(),
          version: { increment: 1 },
        },
      });
      return this.requireDoc(input.organizationId, input.storeId, input.inventoryCountId);
    });
  }

  async cancel(input: {
    organizationId: string;
    storeId: string;
    inventoryCountId: string;
  }) {
    return this.uow.runInTransaction(async () => {
      const doc = await this.requireDoc(input.organizationId, input.storeId, input.inventoryCountId);
      if (doc.status === 'POSTED') {
        throw new ConflictException({ code: 'COUNT_ALREADY_POSTED', message: 'Posted counts cannot be cancelled' });
      }
      if (doc.status === 'CANCELLED') return doc;
      const client = getActivePrismaTx() ?? this.prisma;
      await client.inventoryCount.update({
        where: { id: doc.id },
        data: { status: 'CANCELLED', cancelledAt: this.clock.now(), version: { increment: 1 } },
      });
      return this.requireDoc(input.organizationId, input.storeId, input.inventoryCountId);
    });
  }

  private async requireDoc(organizationId: string, storeId: string, inventoryCountId: string) {
    const client = getActivePrismaTx() ?? this.prisma;
    const doc = await client.inventoryCount.findFirst({
      where: { id: inventoryCountId, organizationId, storeId },
      include: { items: true },
    });
    if (!doc) {
      throw new NotFoundException({ code: 'INVENTORY_COUNT_NOT_FOUND', message: 'Inventory count not found' });
    }
    return doc;
  }

  private async nextNumber(organizationId: string): Promise<string> {
    const client = resolvePrismaClient(this.prisma);
    const count = await client.inventoryCount.count({ where: { organizationId } });
    return `CNT-${String(count + 1).padStart(5, '0')}`;
  }

  private async netMovementsAfterCutoff(
    client: PrismaService | PrismaTransactionClient,
    doc: { id: string; organizationId: string; storeId: string; warehouseId: string; cutoffAt: Date },
    itemId: string,
  ): Promise<string> {
    const movements = await client.inventoryMovement.findMany({
      where: {
        organizationId: doc.organizationId,
        storeId: doc.storeId,
        warehouseId: doc.warehouseId,
        itemId,
        occurredAt: { gt: doc.cutoffAt },
        NOT: {
          sourceDocumentType: 'INVENTORY_COUNT_ITEM',
          sourceDocumentId: doc.id,
        },
      },
    });
    let net = new Prisma.Decimal(0);
    for (const movement of movements) {
      net = net.plus(signedMovementDelta(movement.type, movement.quantity));
    }
    return net.toString();
  }
}

function actorMembershipId(): string | null {
  return getRequestContext()?.auth?.membershipId ?? null;
}

function mapRuleError(error: unknown): never {
  if (error instanceof InventoryOperationRuleError) {
    throw new BadRequestException({ code: error.code, message: error.message });
  }
  throw error;
}
