import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import {
  getActivePrismaTx,
  type PrismaTransactionClient,
} from '../../../infrastructure/persistence/prisma-transaction-context';
import type {
  InventoryIssuePort,
  IssueForSaleCommand,
  IssueForSaleResult,
  IssuedAllocation,
  ReverseIssueCommand,
} from '../application/ports/inventory-issue.port';

type Client = PrismaClient | PrismaTransactionClient;

type Scope = {
  organizationId: string;
  storeId: string;
  warehouseId: string;
};

@Injectable()
export class PrismaInventoryIssueAdapter implements InventoryIssuePort {
  constructor(private readonly prisma: PrismaService) {}

  async issueForSale(command: IssueForSaleCommand): Promise<IssueForSaleResult> {
    const work = async (client: Client): Promise<IssueForSaleResult> => {
      const previous = await client.postingIdempotencyKey.findFirst({
        where: {
          organizationId: command.organizationId,
          scope: 'sale-issue',
          key: command.idempotencyKey,
        },
      });
      if (previous) {
        if (previous.documentId !== command.saleId) {
          throw new ConflictException({
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: 'Idempotency key belongs to another document',
          });
        }
        return this.replayIssueResult(client, command);
      }

      const allocations: IssuedAllocation[] = [];
      let totalCost = new Prisma.Decimal(0);

      for (const line of command.lines) {
        let remaining = new Prisma.Decimal(line.quantity);
        if (remaining.lte(0)) {
          throw new BadRequestException({
            code: 'INVALID_QUANTITY',
            message: 'Issue quantity must be positive',
          });
        }

        await this.lockBalance(client, command, line.itemId);

        const sourceIds = line.reservationSourceItemIds ?? [];
        if (sourceIds.length > 0) {
          const reservations = await client.inventoryReservation.findMany({
            where: {
              organizationId: command.organizationId,
              warehouseId: command.warehouseId,
              itemId: line.itemId,
              orderItemId: { in: sourceIds },
              status: 'ACTIVE',
            },
            orderBy: { createdAt: 'asc' },
          });

          for (const reservation of reservations) {
            if (remaining.lte(0)) break;
            const take = reservation.quantity.lt(remaining) ? reservation.quantity : remaining;
            if (take.lte(0)) continue;

            const batch = await client.inventoryBatch.findUniqueOrThrow({
              where: { id: reservation.batchId },
            });
            const unitCost = batch.unitCost;
            const costAmount = take.mul(unitCost);
            // Unique per slice: @@unique([organizationId, sourceDocumentType, sourceDocumentItemId, type])
            const sourceDocumentItemId = reservation.id;

            await client.inventoryMovement.create({
              data: {
                id: randomUUID(),
                organizationId: command.organizationId,
                storeId: command.storeId,
                warehouseId: command.warehouseId,
                itemId: line.itemId,
                batchId: reservation.batchId,
                type: 'ISSUE',
                quantity: take,
                unitCost,
                sourceDocumentType: 'SALE',
                sourceDocumentId: command.saleId,
                sourceDocumentItemId,
                occurredAt: command.occurredAt,
              },
            });

            const batchRemaining = batch.remainingQuantity.minus(take);
            await client.inventoryBatch.update({
              where: { id: reservation.batchId },
              data: {
                remainingQuantity: batchRemaining,
                ...(batchRemaining.eq(0) ? { status: 'DEPLETED' as const } : {}),
              },
            });

            await this.adjustBalanceOnIssue(client, command, line.itemId, take, take);

            await client.reservationMovement.create({
              data: {
                id: randomUUID(),
                organizationId: command.organizationId,
                storeId: command.storeId,
                warehouseId: command.warehouseId,
                itemId: line.itemId,
                batchId: reservation.batchId,
                reservationId: reservation.id,
                type: 'CONSUME',
                quantity: take,
                sourceDocumentType: 'SALE',
                sourceDocumentId: command.saleId,
                sourceDocumentItemId: reservation.orderItemId,
                occurredAt: command.occurredAt,
              },
            });

            if (take.eq(reservation.quantity)) {
              await client.inventoryReservation.update({
                where: { id: reservation.id },
                data: { status: 'CONSUMED' },
              });
            } else {
              await client.inventoryReservation.update({
                where: { id: reservation.id },
                data: { quantity: reservation.quantity.minus(take) },
              });
            }

            allocations.push({
              itemId: line.itemId,
              batchId: reservation.batchId,
              quantity: take.toString(),
              unitCost: unitCost.toString(),
              costAmount: costAmount.toString(),
            });
            totalCost = totalCost.plus(costAmount);
            remaining = remaining.minus(take);
          }

          await this.releaseExcessReservations(client, command, line.itemId, sourceIds);
        }

        if (remaining.gt(0)) {
          const freeAllocs = await this.issueFromFreeStock(
            client,
            command,
            line.itemId,
            remaining,
          );
          for (const alloc of freeAllocs) {
            allocations.push(alloc);
            totalCost = totalCost.plus(new Prisma.Decimal(alloc.costAmount));
          }
        }
      }

      await client.postingIdempotencyKey.create({
        data: {
          id: randomUUID(),
          organizationId: command.organizationId,
          scope: 'sale-issue',
          key: command.idempotencyKey,
          documentId: command.saleId,
        },
      });

      return {
        allocations,
        totalCostAmount: totalCost.toString(),
        idempotentReplay: false,
      };
    };

    const active = getActivePrismaTx();
    if (active) return work(active);
    return this.prisma.$transaction(work);
  }

  async reverseIssue(command: ReverseIssueCommand): Promise<{ idempotentReplay: boolean }> {
    const work = async (client: Client): Promise<{ idempotentReplay: boolean }> => {
      const previous = await client.postingIdempotencyKey.findFirst({
        where: {
          organizationId: command.organizationId,
          scope: 'sale-issue-reverse',
          key: command.idempotencyKey,
        },
      });
      if (previous) {
        if (previous.documentId !== command.saleId) {
          throw new ConflictException({
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: 'Idempotency key belongs to another document',
          });
        }
        return { idempotentReplay: true };
      }

      const existingReversal = await client.inventoryMovement.findFirst({
        where: {
          organizationId: command.organizationId,
          sourceDocumentType: 'SALE',
          sourceDocumentId: command.saleId,
          type: 'ISSUE_REVERSAL',
        },
      });
      if (existingReversal) {
        await client.postingIdempotencyKey.create({
          data: {
            id: randomUUID(),
            organizationId: command.organizationId,
            scope: 'sale-issue-reverse',
            key: command.idempotencyKey,
            documentId: command.saleId,
          },
        });
        return { idempotentReplay: true };
      }

      const issues = await client.inventoryMovement.findMany({
        where: {
          organizationId: command.organizationId,
          sourceDocumentType: 'SALE',
          sourceDocumentId: command.saleId,
          type: 'ISSUE',
        },
      });

      for (const issue of issues) {
        if (!issue.batchId || issue.unitCost == null) {
          throw new ConflictException({
            code: 'INVALID_ISSUE_MOVEMENT',
            message: 'ISSUE movement is missing batch or unit cost',
          });
        }

        await this.lockBalance(client, command, issue.itemId);

        const qty = issue.quantity;
        const batch = await client.inventoryBatch.findUniqueOrThrow({
          where: { id: issue.batchId },
        });
        const restoredRemaining = batch.remainingQuantity.plus(qty);
        await client.inventoryBatch.update({
          where: { id: batch.id },
          data: {
            remainingQuantity: restoredRemaining,
            ...(batch.status === 'DEPLETED' && restoredRemaining.gt(0)
              ? { status: 'ACTIVE' as const }
              : {}),
          },
        });

        await this.adjustBalanceOnReverse(client, command, issue.itemId, qty);

        await client.inventoryMovement.create({
          data: {
            id: randomUUID(),
            organizationId: command.organizationId,
            storeId: command.storeId,
            warehouseId: command.warehouseId,
            itemId: issue.itemId,
            batchId: issue.batchId,
            type: 'ISSUE_REVERSAL',
            quantity: qty.negated(),
            unitCost: issue.unitCost,
            sourceDocumentType: 'SALE',
            sourceDocumentId: command.saleId,
            sourceDocumentItemId: issue.sourceDocumentItemId,
            reversalOfMovementId: issue.id,
            occurredAt: command.occurredAt,
          },
        });
      }

      await client.postingIdempotencyKey.create({
        data: {
          id: randomUUID(),
          organizationId: command.organizationId,
          scope: 'sale-issue-reverse',
          key: command.idempotencyKey,
          documentId: command.saleId,
        },
      });

      return { idempotentReplay: false };
    };

    const active = getActivePrismaTx();
    if (active) return work(active);
    return this.prisma.$transaction(work);
  }

  private async replayIssueResult(
    client: Client,
    command: Pick<IssueForSaleCommand, 'organizationId' | 'saleId'>,
  ): Promise<IssueForSaleResult> {
    const movements = await client.inventoryMovement.findMany({
      where: {
        organizationId: command.organizationId,
        sourceDocumentType: 'SALE',
        sourceDocumentId: command.saleId,
        type: 'ISSUE',
      },
      orderBy: { createdAt: 'asc' },
    });

    const allocations: IssuedAllocation[] = [];
    let totalCost = new Prisma.Decimal(0);
    for (const movement of movements) {
      if (!movement.batchId || movement.unitCost == null) continue;
      const costAmount = movement.quantity.mul(movement.unitCost);
      allocations.push({
        itemId: movement.itemId,
        batchId: movement.batchId,
        quantity: movement.quantity.toString(),
        unitCost: movement.unitCost.toString(),
        costAmount: costAmount.toString(),
      });
      totalCost = totalCost.plus(costAmount);
    }

    return {
      allocations,
      totalCostAmount: totalCost.toString(),
      idempotentReplay: true,
    };
  }

  private async releaseExcessReservations(
    client: Client,
    command: IssueForSaleCommand,
    itemId: string,
    sourceIds: string[],
  ): Promise<void> {
    const excess = await client.inventoryReservation.findMany({
      where: {
        organizationId: command.organizationId,
        warehouseId: command.warehouseId,
        itemId,
        orderItemId: { in: sourceIds },
        status: 'ACTIVE',
      },
    });
    if (excess.length === 0) return;

    let reservedDelta = new Prisma.Decimal(0);
    for (const reservation of excess) {
      await client.inventoryReservation.update({
        where: { id: reservation.id },
        data: { status: 'RELEASED' },
      });
      await client.reservationMovement.create({
        data: {
          id: randomUUID(),
          organizationId: command.organizationId,
          storeId: command.storeId,
          warehouseId: command.warehouseId,
          itemId: reservation.itemId,
          batchId: reservation.batchId,
          reservationId: reservation.id,
          type: 'RELEASE',
          quantity: reservation.quantity,
          sourceDocumentType: 'SALE',
          sourceDocumentId: command.saleId,
          sourceDocumentItemId: reservation.orderItemId,
          occurredAt: command.occurredAt,
        },
      });
      reservedDelta = reservedDelta.plus(reservation.quantity);
    }

    if (reservedDelta.gt(0)) {
      await this.adjustReservedOnly(client, command, itemId, reservedDelta.negated());
    }
  }

  private async issueFromFreeStock(
    client: Client,
    command: IssueForSaleCommand,
    itemId: string,
    needed: Prisma.Decimal,
  ): Promise<IssuedAllocation[]> {
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

    let remaining = needed;
    const allocations: IssuedAllocation[] = [];

    for (const batch of batches) {
      if (remaining.lte(0)) break;
      const activeOnBatch = await client.inventoryReservation.aggregate({
        where: { batchId: batch.id, status: 'ACTIVE' },
        _sum: { quantity: true },
      });
      const alreadyReserved = activeOnBatch._sum.quantity ?? new Prisma.Decimal(0);
      const free = batch.remainingQuantity.minus(alreadyReserved);
      if (free.lte(0)) continue;

      const take = free.lt(remaining) ? free : remaining;
      const costAmount = take.mul(batch.unitCost);

      await client.inventoryMovement.create({
        data: {
          id: randomUUID(),
          organizationId: command.organizationId,
          storeId: command.storeId,
          warehouseId: command.warehouseId,
          itemId,
          batchId: batch.id,
          type: 'ISSUE',
          quantity: take,
          unitCost: batch.unitCost,
          sourceDocumentType: 'SALE',
          sourceDocumentId: command.saleId,
          // Unique per ISSUE slice (@@unique on type+sourceDocumentItemId)
          sourceDocumentItemId: randomUUID(),
          occurredAt: command.occurredAt,
        },
      });

      const batchRemaining = batch.remainingQuantity.minus(take);
      await client.inventoryBatch.update({
        where: { id: batch.id },
        data: {
          remainingQuantity: batchRemaining,
          ...(batchRemaining.eq(0) ? { status: 'DEPLETED' as const } : {}),
        },
      });

      await this.adjustBalanceOnIssue(client, command, itemId, take, new Prisma.Decimal(0));

      allocations.push({
        itemId,
        batchId: batch.id,
        quantity: take.toString(),
        unitCost: batch.unitCost.toString(),
        costAmount: costAmount.toString(),
      });
      remaining = remaining.minus(take);
    }

    if (remaining.gt(0)) {
      throw new ConflictException({
        code: 'INSUFFICIENT_STOCK',
        message: 'Not enough free stock to issue for sale',
      });
    }

    return allocations;
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

  /** Decrease onHand by `onHandDelta`; decrease reserved by `reservedDelta`. */
  private async adjustBalanceOnIssue(
    client: Client,
    command: Scope,
    itemId: string,
    onHandDelta: Prisma.Decimal,
    reservedDelta: Prisma.Decimal,
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
      throw new ConflictException({
        code: 'NO_BALANCE',
        message: 'Cannot issue without on-hand stock',
      });
    }
    const onHandQuantity = balance.onHandQuantity.minus(onHandDelta);
    const reservedQuantity = balance.reservedQuantity.minus(reservedDelta);
    const availableQuantity = onHandQuantity.minus(reservedQuantity);
    if (onHandQuantity.lt(0) || reservedQuantity.lt(0) || availableQuantity.lt(0)) {
      throw new ConflictException({
        code: 'NEGATIVE_BALANCE',
        message: 'Issue would make inventory balance negative',
      });
    }
    await client.inventoryBalance.update({
      where,
      data: { onHandQuantity, reservedQuantity, availableQuantity },
    });
  }

  private async adjustBalanceOnReverse(
    client: Client,
    command: Scope,
    itemId: string,
    onHandDelta: Prisma.Decimal,
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
      await client.inventoryBalance.create({
        data: {
          id: randomUUID(),
          organizationId: command.organizationId,
          storeId: command.storeId,
          warehouseId: command.warehouseId,
          itemId,
          onHandQuantity: onHandDelta,
          reservedQuantity: 0,
          availableQuantity: onHandDelta,
        },
      });
      return;
    }
    const onHandQuantity = balance.onHandQuantity.plus(onHandDelta);
    const availableQuantity = onHandQuantity.minus(balance.reservedQuantity);
    await client.inventoryBalance.update({
      where,
      data: { onHandQuantity, availableQuantity },
    });
  }

  private async adjustReservedOnly(
    client: Client,
    command: Scope,
    itemId: string,
    delta: Prisma.Decimal,
  ): Promise<void> {
    await this.lockBalance(client, command, itemId);
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
      if (delta.gt(0)) {
        throw new ConflictException({
          code: 'NO_BALANCE',
          message: 'Cannot adjust reserved without balance',
        });
      }
      return;
    }
    const reservedQuantity = balance.reservedQuantity.plus(delta);
    const availableQuantity = balance.onHandQuantity.minus(reservedQuantity);
    if (reservedQuantity.lt(0) || availableQuantity.lt(0)) {
      throw new ConflictException({
        code: 'NEGATIVE_AVAILABLE',
        message: 'Release would make available quantity negative',
      });
    }
    await client.inventoryBalance.update({
      where,
      data: { reservedQuantity, availableQuantity },
    });
  }
}
