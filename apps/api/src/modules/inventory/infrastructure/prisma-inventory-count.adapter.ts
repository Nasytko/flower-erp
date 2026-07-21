import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import {
  getActivePrismaTx,
  type PrismaTransactionClient,
  resolvePrismaClient,
} from '../../../infrastructure/persistence/prisma-transaction-context';
import { weightedAverageUnitCost, InventoryOperationRuleError } from '../domain/inventory-operations-rules';import type {
  InventoryCountPort,
  InventoryCountSnapshotRow,
  PostInventoryCountCommand,
} from '../application/ports/inventory-count.port';

type Client = PrismaClient | PrismaTransactionClient;
type Scope = { organizationId: string; storeId: string; warehouseId: string };

@Injectable()
export class PrismaInventoryCountAdapter implements InventoryCountPort {
  constructor(private readonly prisma: PrismaService) {}

  async snapshotCount(
    organizationId: string,
    storeId: string,
    warehouseId: string,
  ): Promise<InventoryCountSnapshotRow[]> {
    const client = resolvePrismaClient(this.prisma);
    const balances = await client.inventoryBalance.findMany({
      where: { organizationId, storeId, warehouseId },
      orderBy: { itemId: 'asc' },
    });
    return balances.map((row) => ({
      itemId: row.itemId,
      expectedQuantity: row.onHandQuantity.toString(),
    }));
  }

  async postInventoryCount(command: PostInventoryCountCommand): Promise<{ idempotentReplay: boolean }> {
    const work = async (client: Client): Promise<{ idempotentReplay: boolean }> => {
      const previous = await client.postingIdempotencyKey.findFirst({
        where: {
          organizationId: command.organizationId,
          scope: 'inventory-count-post',
          key: command.idempotencyKey,
        },
      });
      if (previous) {
        if (previous.documentId !== command.inventoryCountId) {
          throw new ConflictException({
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: 'Idempotency key belongs to another document',
          });
        }
        return { idempotentReplay: true };
      }

      for (const line of command.lines) {
        await this.lockBalance(client, command, line.itemId);
        const delta = new Prisma.Decimal(line.varianceQuantity);
        if (line.movementType === 'COUNT_ADJUSTMENT_OUT') {
          await this.applyOutboundAdjustment(client, command, line.itemId, line.inventoryCountItemId, delta.abs());
        } else {
          await this.applyInboundAdjustment(client, command, line.itemId, line.inventoryCountItemId, delta);
        }
      }

      await client.postingIdempotencyKey.create({
        data: {
          id: randomUUID(),
          organizationId: command.organizationId,
          scope: 'inventory-count-post',
          key: command.idempotencyKey,
          documentId: command.inventoryCountId,
        },
      });
      return { idempotentReplay: false };
    };

    const active = getActivePrismaTx();
    if (active) return work(active);
    return this.prisma.$transaction(work);
  }

  private async applyInboundAdjustment(
    client: Client,
    command: Scope & { occurredAt: Date; inventoryCountId: string },
    itemId: string,
    inventoryCountItemId: string,
    quantity: Prisma.Decimal,
  ): Promise<void> {
    const batches = await client.inventoryBatch.findMany({
      where: {
        organizationId: command.organizationId,
        storeId: command.storeId,
        warehouseId: command.warehouseId,
        itemId,
        status: 'ACTIVE',
        remainingQuantity: { gt: 0 },
      },
    });
    let unitCost: Prisma.Decimal;
    try {
      unitCost = new Prisma.Decimal(
        weightedAverageUnitCost(
          batches.map((batch) => ({
            remainingQuantity: batch.remainingQuantity.toString(),
            unitCost: batch.unitCost.toString(),
          })),
        ),
      );
    } catch (error) {
      if (error instanceof InventoryOperationRuleError) {
        throw new ConflictException({ code: error.code, message: error.message });
      }
      throw error;
    }
    const batch = await client.inventoryBatch.create({
      data: {
        id: randomUUID(),
        organizationId: command.organizationId,
        storeId: command.storeId,
        warehouseId: command.warehouseId,
        itemId,
        batchSourceType: 'COUNT_ADJUSTMENT',
        inventoryCountItemId,
        receivedAt: command.occurredAt,
        initialQuantity: quantity,
        remainingQuantity: quantity,
        unitCost,
      },
    });
    await client.inventoryMovement.create({
      data: {
        id: randomUUID(),
        organizationId: command.organizationId,
        storeId: command.storeId,
        warehouseId: command.warehouseId,
        itemId,
        batchId: batch.id,
        type: 'COUNT_ADJUSTMENT_IN',
        quantity,
        unitCost,
        sourceDocumentType: 'INVENTORY_COUNT_ITEM',
        sourceDocumentId: command.inventoryCountId,
        sourceDocumentItemId: inventoryCountItemId,
        occurredAt: command.occurredAt,
      },
    });
    await client.inventoryCountItem.update({
      where: { id: inventoryCountItemId },
      data: { varianceQuantity: quantity },
    });
    await this.adjustBalance(client, command, itemId, quantity);
  }

  private async applyOutboundAdjustment(
    client: Client,
    command: Scope & { occurredAt: Date; inventoryCountId: string },
    itemId: string,
    inventoryCountItemId: string,
    quantity: Prisma.Decimal,
  ): Promise<void> {
    let remaining = quantity;
    const batches = await client.inventoryBatch.findMany({
      where: {
        organizationId: command.organizationId,
        storeId: command.storeId,
        warehouseId: command.warehouseId,
        itemId,
        status: 'ACTIVE',
        remainingQuantity: { gt: 0 },
      },
      orderBy: [{ expiresAt: { sort: 'asc', nulls: 'last' } }, { receivedAt: 'asc' }],
    });

    for (const batch of batches) {
      if (remaining.lte(0)) break;
      const activeOnBatch = await client.inventoryReservation.aggregate({
        where: { batchId: batch.id, status: 'ACTIVE' },
        _sum: { quantity: true },
      });
      const reserved = activeOnBatch._sum.quantity ?? new Prisma.Decimal(0);
      const free = batch.remainingQuantity.minus(reserved);
      if (free.lte(0)) continue;
      const take = free.lt(remaining) ? free : remaining;
      await client.inventoryMovement.create({
        data: {
          id: randomUUID(),
          organizationId: command.organizationId,
          storeId: command.storeId,
          warehouseId: command.warehouseId,
          itemId,
          batchId: batch.id,
          type: 'COUNT_ADJUSTMENT_OUT',
          quantity: take,
          unitCost: batch.unitCost,
          sourceDocumentType: 'INVENTORY_COUNT_ITEM',
          sourceDocumentId: command.inventoryCountId,
          sourceDocumentItemId: remaining.eq(quantity) ? inventoryCountItemId : randomUUID(),
          occurredAt: command.occurredAt,
        },
      });
      const nextRemaining = batch.remainingQuantity.minus(take);
      await client.inventoryBatch.update({
        where: { id: batch.id },
        data: {
          remainingQuantity: nextRemaining,
          ...(nextRemaining.eq(0) ? { status: 'DEPLETED' as const } : {}),
        },
      });
      remaining = remaining.minus(take);
    }
    if (remaining.gt(0)) {
      throw new ConflictException({
        code: 'INSUFFICIENT_FREE_STOCK',
        message: 'Count adjustment cannot consume reserved or missing stock',
      });
    }
    await client.inventoryCountItem.update({
      where: { id: inventoryCountItemId },
      data: { varianceQuantity: quantity.negated() },
    });
    await this.adjustBalance(client, command, itemId, quantity.negated());
  }

  private async lockBalance(client: Client, command: Scope, itemId: string): Promise<void> {
    await client.$queryRaw`
      SELECT "id" FROM "inventory_balances"
      WHERE "organization_id" = ${command.organizationId}::uuid
        AND "store_id" = ${command.storeId}::uuid
        AND "warehouse_id" = ${command.warehouseId}::uuid
        AND "item_id" = ${itemId}::uuid
      FOR UPDATE`;
  }

  private async adjustBalance(
    client: Client,
    command: Scope,
    itemId: string,
    delta: Prisma.Decimal,
  ): Promise<void> {
    const where = {
      organizationId_storeId_warehouseId_itemId: {
        organizationId: command.organizationId,
        storeId: command.storeId,
        warehouseId: command.warehouseId,
        itemId,
      },
    };
    const balance = await client.inventoryBalance.findUnique({ where });
    if (!balance) {
      if (delta.lt(0)) {
        throw new ConflictException({ code: 'NO_BALANCE', message: 'Inventory balance not found' });
      }
      await client.inventoryBalance.create({
        data: {
          id: randomUUID(),
          organizationId: command.organizationId,
          storeId: command.storeId,
          warehouseId: command.warehouseId,
          itemId,
          onHandQuantity: delta,
          reservedQuantity: 0,
          availableQuantity: delta,
        },
      });
      return;
    }
    const onHandQuantity = balance.onHandQuantity.plus(delta);
    const availableQuantity = onHandQuantity.minus(balance.reservedQuantity);
    if (onHandQuantity.lt(0) || availableQuantity.lt(0)) {
      throw new ConflictException({
        code: 'NEGATIVE_BALANCE',
        message: 'Count posting would make inventory balance negative',
      });
    }
    await client.inventoryBalance.update({
      where,
      data: { onHandQuantity, availableQuantity },
    });
  }
}
