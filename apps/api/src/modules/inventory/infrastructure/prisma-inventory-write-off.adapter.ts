import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import {
  getActivePrismaTx,
  type PrismaTransactionClient,
} from '../../../infrastructure/persistence/prisma-transaction-context';
import type {
  InventoryWriteOffPort,
  PostWriteOffCommand,
  ReverseWriteOffCommand,
  WriteOffPostingResult,
} from '../application/ports/inventory-write-off.port';

type Client = PrismaClient | PrismaTransactionClient;
type Scope = { organizationId: string; storeId: string; warehouseId: string };

@Injectable()
export class PrismaInventoryWriteOffAdapter implements InventoryWriteOffPort {
  constructor(private readonly prisma: PrismaService) {}

  async postWriteOff(command: PostWriteOffCommand): Promise<WriteOffPostingResult> {
    const work = async (client: Client): Promise<WriteOffPostingResult> => {
      const previous = await client.postingIdempotencyKey.findFirst({
        where: {
          organizationId: command.organizationId,
          scope: 'write-off-post',
          key: command.idempotencyKey,
        },
      });
      if (previous) {
        if (previous.documentId !== command.writeOffId) {
          throw new ConflictException({
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: 'Idempotency key belongs to another document',
          });
        }
        const existing = await client.writeOffItem.findMany({
          where: { organizationId: command.organizationId, writeOffDocumentId: command.writeOffId },
        });
        const totalCostAmount = existing.reduce(
          (acc, item) => acc.plus(item.costAmountSnapshot ?? new Prisma.Decimal(0)),
          new Prisma.Decimal(0),
        );
        return { idempotentReplay: true, totalCostAmount: totalCostAmount.toString() };
      }

      let totalCostAmount = new Prisma.Decimal(0);
      for (const line of command.lines) {
        let remaining = new Prisma.Decimal(line.quantity);
        await this.lockBalance(client, command, line.itemId);

        const batches = await client.inventoryBatch.findMany({
          where: {
            organizationId: command.organizationId,
            storeId: command.storeId,
            warehouseId: command.warehouseId,
            itemId: line.itemId,
            status: 'ACTIVE',
            remainingQuantity: { gt: 0 },
          },
          orderBy: [{ expiresAt: { sort: 'asc', nulls: 'last' } }, { receivedAt: 'asc' }],
        });

        let lineCost = new Prisma.Decimal(0);
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
          const costAmount = take.mul(batch.unitCost);

          await client.inventoryMovement.create({
            data: {
              id: randomUUID(),
              organizationId: command.organizationId,
              storeId: command.storeId,
              warehouseId: command.warehouseId,
              itemId: line.itemId,
              batchId: batch.id,
              type: 'WRITE_OFF',
              quantity: take,
              unitCost: batch.unitCost,
              sourceDocumentType: 'WRITE_OFF_ITEM',
              sourceDocumentId: command.writeOffId,
              sourceDocumentItemId: remaining.eq(new Prisma.Decimal(line.quantity))
                ? line.writeOffItemId
                : randomUUID(),
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

          await this.adjustBalance(client, command, line.itemId, take.negated());

          lineCost = lineCost.plus(costAmount);
          totalCostAmount = totalCostAmount.plus(costAmount);
          remaining = remaining.minus(take);
        }

        if (remaining.gt(0)) {
          throw new ConflictException({
            code: 'INSUFFICIENT_FREE_STOCK',
            message: 'Not enough free stock to write off',
          });
        }

        const unitCostSnapshot = new Prisma.Decimal(line.quantity).gt(0)
          ? lineCost.div(new Prisma.Decimal(line.quantity))
          : null;
        await client.writeOffItem.update({
          where: { id: line.writeOffItemId },
          data: {
            unitCostSnapshot,
            costAmountSnapshot: lineCost,
          },
        });
      }

      await client.postingIdempotencyKey.create({
        data: {
          id: randomUUID(),
          organizationId: command.organizationId,
          scope: 'write-off-post',
          key: command.idempotencyKey,
          documentId: command.writeOffId,
        },
      });

      return { idempotentReplay: false, totalCostAmount: totalCostAmount.toString() };
    };

    const active = getActivePrismaTx();
    if (active) return work(active);
    return this.prisma.$transaction(work);
  }

  async reverseWriteOff(command: ReverseWriteOffCommand): Promise<{ idempotentReplay: boolean }> {
    const work = async (client: Client): Promise<{ idempotentReplay: boolean }> => {
      const previous = await client.postingIdempotencyKey.findFirst({
        where: {
          organizationId: command.organizationId,
          scope: 'write-off-reverse',
          key: command.idempotencyKey,
        },
      });
      if (previous) {
        if (previous.documentId !== command.writeOffId) {
          throw new ConflictException({
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: 'Idempotency key belongs to another document',
          });
        }
        return { idempotentReplay: true };
      }

      const movements = await client.inventoryMovement.findMany({
        where: {
          organizationId: command.organizationId,
          sourceDocumentType: 'WRITE_OFF_ITEM',
          sourceDocumentId: command.writeOffId,
          type: 'WRITE_OFF',
        },
      });

      for (const movement of movements) {
        if (!movement.batchId || movement.unitCost == null) continue;
        await this.lockBalance(client, command, movement.itemId);
        const batch = await client.inventoryBatch.findUniqueOrThrow({ where: { id: movement.batchId } });
        const restored = batch.remainingQuantity.plus(movement.quantity);
        await client.inventoryBatch.update({
          where: { id: batch.id },
          data: {
            remainingQuantity: restored,
            ...(batch.status === 'DEPLETED' && restored.gt(0) ? { status: 'ACTIVE' as const } : {}),
          },
        });
        await this.adjustBalance(client, command, movement.itemId, movement.quantity);
        await client.inventoryMovement.create({
          data: {
            id: randomUUID(),
            organizationId: command.organizationId,
            storeId: command.storeId,
            warehouseId: command.warehouseId,
            itemId: movement.itemId,
            batchId: movement.batchId,
            type: 'WRITE_OFF_REVERSAL',
            quantity: movement.quantity.negated(),
            unitCost: movement.unitCost,
            sourceDocumentType: 'WRITE_OFF_ITEM',
            sourceDocumentId: command.writeOffId,
            sourceDocumentItemId: movement.sourceDocumentItemId,
            reversalOfMovementId: movement.id,
            occurredAt: command.occurredAt,
          },
        });
      }

      await client.postingIdempotencyKey.create({
        data: {
          id: randomUUID(),
          organizationId: command.organizationId,
          scope: 'write-off-reverse',
          key: command.idempotencyKey,
          documentId: command.writeOffId,
        },
      });
      return { idempotentReplay: false };
    };

    const active = getActivePrismaTx();
    if (active) return work(active);
    return this.prisma.$transaction(work);
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
      throw new ConflictException({ code: 'NO_BALANCE', message: 'Inventory balance not found' });
    }
    const onHandQuantity = balance.onHandQuantity.plus(delta);
    const availableQuantity = onHandQuantity.minus(balance.reservedQuantity);
    if (onHandQuantity.lt(0) || availableQuantity.lt(0)) {
      throw new ConflictException({
        code: 'NEGATIVE_BALANCE',
        message: 'Write-off would make inventory balance negative',
      });
    }
    await client.inventoryBalance.update({
      where,
      data: { onHandQuantity, availableQuantity },
    });
  }
}
