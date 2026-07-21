import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import {
  getActivePrismaTx,
  type PrismaTransactionClient,
} from '../../../infrastructure/persistence/prisma-transaction-context';
import type {
  DispatchTransferCommand,
  DispatchTransferResult,
  InventoryTransferPort,
  ReceiveTransferCommand,
  ReverseTransferCommand,
} from '../application/ports/inventory-transfer.port';

type Client = PrismaClient | PrismaTransactionClient;
type Scope = { organizationId: string; storeId: string; warehouseId: string };

@Injectable()
export class PrismaInventoryTransferAdapter implements InventoryTransferPort {
  constructor(private readonly prisma: PrismaService) {}

  async dispatchTransfer(command: DispatchTransferCommand): Promise<DispatchTransferResult> {
    const work = async (client: Client): Promise<DispatchTransferResult> => {
      const previous = await client.postingIdempotencyKey.findFirst({
        where: {
          organizationId: command.organizationId,
          scope: 'transfer-dispatch',
          key: command.idempotencyKey,
        },
      });
      if (previous) {
        if (previous.documentId !== command.transferId) {
          throw new ConflictException({
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: 'Idempotency key belongs to another document',
          });
        }
        const allocations = await client.transferAllocation.findMany({
          where: { organizationId: command.organizationId, transferDocumentId: command.transferId },
          orderBy: { createdAt: 'asc' },
        });
        return {
          idempotentReplay: true,
          allocations: allocations.map((row) => ({
            transferAllocationId: row.id,
            transferItemId: row.transferItemId,
            itemId: row.fromItemId,
            batchId: row.batchId,
            quantityDispatched: row.quantityDispatched.toString(),
            unitCost: row.unitCost.toString(),
          })),
        };
      }

      const allocations: DispatchTransferResult['allocations'] = [];
      for (const line of command.lines) {
        let remaining = new Prisma.Decimal(line.dispatchQuantity);
        await this.lockBalance(client, {
          organizationId: command.organizationId,
          storeId: command.storeId,
          warehouseId: command.fromWarehouseId,
        }, line.itemId);

        const batches = await client.inventoryBatch.findMany({
          where: {
            organizationId: command.organizationId,
            storeId: command.storeId,
            warehouseId: command.fromWarehouseId,
            itemId: line.itemId,
            status: 'ACTIVE',
            remainingQuantity: { gt: 0 },
          },
          orderBy: [{ expiresAt: { sort: 'asc', nulls: 'last' } }, { receivedAt: 'asc' }],
        });

        let dispatched = new Prisma.Decimal(0);
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

          const allocation = await client.transferAllocation.create({
            data: {
              id: randomUUID(),
              organizationId: command.organizationId,
              transferDocumentId: command.transferId,
              transferItemId: line.transferItemId,
              fromItemId: line.itemId,
              batchId: batch.id,
              quantityDispatched: take,
              unitCost: batch.unitCost,
            },
          });

          await client.inventoryMovement.create({
            data: {
              id: randomUUID(),
              organizationId: command.organizationId,
              storeId: command.storeId,
              warehouseId: command.fromWarehouseId,
              itemId: line.itemId,
              batchId: batch.id,
              type: 'TRANSFER_OUT',
              quantity: take,
              unitCost: batch.unitCost,
              sourceDocumentType: 'TRANSFER_ALLOCATION',
              sourceDocumentId: command.transferId,
              sourceDocumentItemId: allocation.id,
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
          await this.adjustBalance(client, {
            organizationId: command.organizationId,
            storeId: command.storeId,
            warehouseId: command.fromWarehouseId,
          }, line.itemId, take.negated());

          allocations.push({
            transferAllocationId: allocation.id,
            transferItemId: line.transferItemId,
            itemId: line.itemId,
            batchId: batch.id,
            quantityDispatched: take.toString(),
            unitCost: batch.unitCost.toString(),
          });
          dispatched = dispatched.plus(take);
          remaining = remaining.minus(take);
        }

        if (remaining.gt(0)) {
          throw new ConflictException({
            code: 'INSUFFICIENT_FREE_STOCK',
            message: 'Not enough free stock to dispatch transfer',
          });
        }

        await client.transferItem.update({
          where: { id: line.transferItemId },
          data: { dispatchedQuantity: dispatched },
        });
      }

      await client.postingIdempotencyKey.create({
        data: {
          id: randomUUID(),
          organizationId: command.organizationId,
          scope: 'transfer-dispatch',
          key: command.idempotencyKey,
          documentId: command.transferId,
        },
      });

      return { idempotentReplay: false, allocations };
    };

    const active = getActivePrismaTx();
    if (active) return work(active);
    return this.prisma.$transaction(work);
  }

  async receiveTransfer(command: ReceiveTransferCommand): Promise<{ idempotentReplay: boolean }> {
    const work = async (client: Client): Promise<{ idempotentReplay: boolean }> => {
      const previous = await client.postingIdempotencyKey.findFirst({
        where: {
          organizationId: command.organizationId,
          scope: 'transfer-receive',
          key: command.idempotencyKey,
        },
      });
      if (previous) {
        if (previous.documentId !== command.transferId) {
          throw new ConflictException({
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: 'Idempotency key belongs to another document',
          });
        }
        return { idempotentReplay: true };
      }

      for (const line of command.lines) {
        const allocation = await client.transferAllocation.findUniqueOrThrow({
          where: { id: line.transferAllocationId },
        });
        const received = new Prisma.Decimal(line.receivedQuantity);
        const damaged = new Prisma.Decimal(line.damagedQuantity);
        const total = received.plus(damaged);
        if (total.gt(allocation.quantityDispatched)) {
          throw new ConflictException({
            code: 'RECEIPT_EXCEEDS_DISPATCHED',
            message: 'Received plus damaged quantity cannot exceed dispatched quantity',
          });
        }
        if (received.gt(0)) {
          const batch = await client.inventoryBatch.create({
            data: {
              id: randomUUID(),
              organizationId: command.organizationId,
              storeId: command.storeId,
              warehouseId: command.toWarehouseId,
              itemId: line.itemId,
              batchSourceType: 'TRANSFER_IN',
              transferAllocationId: allocation.id,
              receivedAt: command.occurredAt,
              initialQuantity: received,
              remainingQuantity: received,
              unitCost: allocation.unitCost,
            },
          });
          await client.inventoryMovement.create({
            data: {
              id: randomUUID(),
              organizationId: command.organizationId,
              storeId: command.storeId,
              warehouseId: command.toWarehouseId,
              itemId: line.itemId,
              batchId: batch.id,
              type: 'TRANSFER_IN',
              quantity: received,
              unitCost: allocation.unitCost,
              sourceDocumentType: 'TRANSFER_ALLOCATION',
              sourceDocumentId: command.transferId,
              sourceDocumentItemId: allocation.id,
              occurredAt: command.occurredAt,
            },
          });
          await this.adjustBalance(client, {
            organizationId: command.organizationId,
            storeId: command.storeId,
            warehouseId: command.toWarehouseId,
          }, line.itemId, received);
        }

        await client.transferAllocation.update({
          where: { id: allocation.id },
          data: {
            quantityReceived: received,
            quantityDamaged: damaged,
            toItemId: line.itemId,
          },
        });
      }

      const itemSums = await client.transferAllocation.groupBy({
        by: ['transferItemId'],
        where: { organizationId: command.organizationId, transferDocumentId: command.transferId },
        _sum: { quantityReceived: true, quantityDamaged: true },
      });
      for (const sum of itemSums) {
        await client.transferItem.update({
          where: { id: sum.transferItemId },
          data: {
            receivedQuantity: sum._sum.quantityReceived ?? new Prisma.Decimal(0),
            damagedQuantity: sum._sum.quantityDamaged ?? new Prisma.Decimal(0),
          },
        });
      }

      await client.postingIdempotencyKey.create({
        data: {
          id: randomUUID(),
          organizationId: command.organizationId,
          scope: 'transfer-receive',
          key: command.idempotencyKey,
          documentId: command.transferId,
        },
      });
      return { idempotentReplay: false };
    };

    const active = getActivePrismaTx();
    if (active) return work(active);
    return this.prisma.$transaction(work);
  }

  async reverseTransfer(command: ReverseTransferCommand): Promise<{ idempotentReplay: boolean }> {
    const work = async (client: Client): Promise<{ idempotentReplay: boolean }> => {
      const previous = await client.postingIdempotencyKey.findFirst({
        where: {
          organizationId: command.organizationId,
          scope: 'transfer-reverse',
          key: command.idempotencyKey,
        },
      });
      if (previous) {
        if (previous.documentId !== command.transferId) {
          throw new ConflictException({
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: 'Idempotency key belongs to another document',
          });
        }
        return { idempotentReplay: true };
      }

      const outMovements = await client.inventoryMovement.findMany({
        where: {
          organizationId: command.organizationId,
          sourceDocumentType: 'TRANSFER_ALLOCATION',
          sourceDocumentId: command.transferId,
          type: 'TRANSFER_OUT',
        },
      });

      for (const movement of outMovements) {
        if (!movement.batchId || movement.unitCost == null) continue;
        await this.lockBalance(client, {
          organizationId: command.organizationId,
          storeId: command.storeId,
          warehouseId: command.fromWarehouseId,
        }, movement.itemId);
        const batch = await client.inventoryBatch.findUniqueOrThrow({ where: { id: movement.batchId } });
        const restored = batch.remainingQuantity.plus(movement.quantity);
        await client.inventoryBatch.update({
          where: { id: batch.id },
          data: {
            remainingQuantity: restored,
            ...(batch.status === 'DEPLETED' && restored.gt(0) ? { status: 'ACTIVE' as const } : {}),
          },
        });
        await this.adjustBalance(client, {
          organizationId: command.organizationId,
          storeId: command.storeId,
          warehouseId: command.fromWarehouseId,
        }, movement.itemId, movement.quantity);
        await client.inventoryMovement.create({
          data: {
            id: randomUUID(),
            organizationId: command.organizationId,
            storeId: command.storeId,
            warehouseId: command.fromWarehouseId,
            itemId: movement.itemId,
            batchId: movement.batchId,
            type: 'TRANSFER_OUT_REVERSAL',
            quantity: movement.quantity.negated(),
            unitCost: movement.unitCost,
            sourceDocumentType: 'TRANSFER_ALLOCATION',
            sourceDocumentId: command.transferId,
            sourceDocumentItemId: movement.sourceDocumentItemId,
            reversalOfMovementId: movement.id,
            occurredAt: command.occurredAt,
          },
        });
      }

      const inbound = await client.inventoryBatch.findMany({
        where: {
          organizationId: command.organizationId,
          transferAllocationId: { not: null },
          transferAllocation: { transferDocumentId: command.transferId },
        },
      });
      for (const batch of inbound) {
        await this.lockBalance(client, {
          organizationId: command.organizationId,
          storeId: command.storeId,
          warehouseId: command.toWarehouseId,
        }, batch.itemId);
        if (!batch.remainingQuantity.equals(batch.initialQuantity)) {
          throw new ConflictException({
            code: 'TRANSFER_IN_BATCH_ALREADY_USED',
            message: 'Received transfer batches must be unused before reversal',
          });
        }
        await this.adjustBalance(client, {
          organizationId: command.organizationId,
          storeId: command.storeId,
          warehouseId: command.toWarehouseId,
        }, batch.itemId, batch.initialQuantity.negated());
        await client.inventoryMovement.create({
          data: {
            id: randomUUID(),
            organizationId: command.organizationId,
            storeId: command.storeId,
            warehouseId: command.toWarehouseId,
            itemId: batch.itemId,
            batchId: batch.id,
            type: 'TRANSFER_IN_REVERSAL',
            quantity: batch.initialQuantity.negated(),
            unitCost: batch.unitCost,
            sourceDocumentType: 'TRANSFER_ALLOCATION',
            sourceDocumentId: command.transferId,
            sourceDocumentItemId: batch.transferAllocationId!,
            occurredAt: command.occurredAt,
          },
        });
        await client.inventoryBatch.update({
          where: { id: batch.id },
          data: { remainingQuantity: 0, status: 'REVERSED' },
        });
      }

      await client.postingIdempotencyKey.create({
        data: {
          id: randomUUID(),
          organizationId: command.organizationId,
          scope: 'transfer-reverse',
          key: command.idempotencyKey,
          documentId: command.transferId,
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
        message: 'Transfer would make inventory balance negative',
      });
    }
    await client.inventoryBalance.update({
      where,
      data: { onHandQuantity, availableQuantity },
    });
  }
}
