import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import {
  getActivePrismaTx,
  type PrismaTransactionClient,
} from '../../../infrastructure/persistence/prisma-transaction-context';
import type {
  InventoryReservationPort,
  LineAllocationResult,
  ReleaseCompositionCommand,
  ReleaseOrderStockCommand,
  ReserveCompositionCommand,
  ReserveCompositionResult,
  ReserveOrderStockCommand,
  ReserveOrderStockResult,
} from '../application/ports/inventory-reservation.port';

type Client = PrismaClient | PrismaTransactionClient;

type Scope = {
  organizationId: string;
  storeId: string;
  warehouseId: string;
  orderId: string;
};

@Injectable()
export class PrismaInventoryReservationAdapter implements InventoryReservationPort {
  constructor(private readonly prisma: PrismaService) {}

  async reserveComposition(command: ReserveCompositionCommand): Promise<ReserveCompositionResult> {
    const work = async (client: Client): Promise<ReserveCompositionResult> => {
      const compositionItemIds = command.lines.map((l) => l.compositionItemId);
      await this.releaseActiveForItems(client, command, compositionItemIds);

      const allocations: Array<{
        compositionItemId: string;
        itemId: string;
        batchId: string;
        quantity: Prisma.Decimal;
      }> = [];
      const lineResults: LineAllocationResult[] = [];

      for (const line of command.lines) {
        const requested = new Prisma.Decimal(line.quantity);
        if (requested.lte(0)) {
          throw new ConflictException({
            code: 'INVALID_QUANTITY',
            message: 'Reservation quantity must be positive',
          });
        }

        await this.lockBalance(client, command, line.itemId);
        const balance = await client.inventoryBalance.findUnique({
          where: {
            organizationId_storeId_warehouseId_itemId: {
              organizationId: command.organizationId,
              storeId: command.storeId,
              warehouseId: command.warehouseId,
              itemId: line.itemId,
            },
          },
        });
        const availableRaw = balance?.availableQuantity ?? new Prisma.Decimal(0);
        const available = availableRaw.lt(0) ? new Prisma.Decimal(0) : availableRaw;
        const toReserve = requested.lt(available) ? requested : available;

        if (toReserve.lte(0)) {
          lineResults.push({
            compositionItemId: line.compositionItemId,
            itemId: line.itemId,
            requestedQuantity: requested.toString(),
            reservedQuantity: '0',
            deficitQuantity: requested.toString(),
          });
          continue;
        }

        const batches = await client.inventoryBatch.findMany({
          where: {
            organizationId: command.organizationId,
            storeId: command.storeId,
            warehouseId: command.warehouseId,
            itemId: line.itemId,
            status: 'ACTIVE',
            remainingQuantity: { gt: 0 },
          },
          orderBy: [
            { expiresAt: { sort: 'asc', nulls: 'last' } },
            { receivedAt: 'asc' },
          ],
        });

        let remaining = toReserve;
        const lineAllocs: typeof allocations = [];
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
          lineAllocs.push({
            compositionItemId: line.compositionItemId,
            itemId: line.itemId,
            batchId: batch.id,
            quantity: take,
          });
          remaining = remaining.minus(take);
        }

        const reservedQty = toReserve.minus(remaining);
        allocations.push(...lineAllocs);
        lineResults.push({
          compositionItemId: line.compositionItemId,
          itemId: line.itemId,
          requestedQuantity: requested.toString(),
          reservedQuantity: reservedQty.toString(),
          deficitQuantity: requested.minus(reservedQty).toString(),
        });
      }

      const now = new Date();
      const reservedByItem = new Map<string, Prisma.Decimal>();
      for (const alloc of allocations) {
        const reservationId = randomUUID();
        await client.inventoryReservation.create({
          data: {
            id: reservationId,
            organizationId: command.organizationId,
            storeId: command.storeId,
            warehouseId: command.warehouseId,
            itemId: alloc.itemId,
            batchId: alloc.batchId,
            orderItemId: alloc.compositionItemId,
            quantity: alloc.quantity,
            status: 'ACTIVE',
          },
        });
        await client.reservationMovement.create({
          data: {
            id: randomUUID(),
            organizationId: command.organizationId,
            storeId: command.storeId,
            warehouseId: command.warehouseId,
            itemId: alloc.itemId,
            batchId: alloc.batchId,
            reservationId,
            type: 'RESERVE',
            quantity: alloc.quantity,
            sourceDocumentType: 'ORDER',
            sourceDocumentId: command.orderId,
            sourceDocumentItemId: alloc.compositionItemId,
            occurredAt: now,
          },
        });
        reservedByItem.set(
          alloc.itemId,
          (reservedByItem.get(alloc.itemId) ?? new Prisma.Decimal(0)).plus(alloc.quantity),
        );
      }

      for (const [itemId, delta] of reservedByItem) {
        await this.adjustReserved(client, command, itemId, delta);
      }

      const anyReserved = lineResults.some((r) => new Prisma.Decimal(r.reservedQuantity).gt(0));
      const allFull = lineResults.every((r) => new Prisma.Decimal(r.deficitQuantity).eq(0));
      let outcome: ReserveCompositionResult['outcome'];
      if (allFull) outcome = 'FULL';
      else if (anyReserved) outcome = 'PARTIAL';
      else outcome = 'NONE';

      return { outcome, lines: lineResults };
    };

    const active = getActivePrismaTx();
    if (active) return work(active);
    return this.prisma.$transaction(work);
  }

  async releaseComposition(command: ReleaseCompositionCommand): Promise<void> {
    const work = async (client: Client) => {
      await this.releaseActiveForItems(client, command, command.compositionItemIds);
    };
    const active = getActivePrismaTx();
    if (active) return work(active);
    return this.prisma.$transaction(work);
  }

  async sumActiveReservedByCompositionItems(
    organizationId: string,
    compositionItemIds: string[],
  ): Promise<Map<string, string>> {
    const client = getActivePrismaTx() ?? this.prisma;
    if (compositionItemIds.length === 0) return new Map();
    const rows = await client.inventoryReservation.groupBy({
      by: ['orderItemId'],
      where: {
        organizationId,
        orderItemId: { in: compositionItemIds },
        status: 'ACTIVE',
      },
      _sum: { quantity: true },
    });
    const map = new Map<string, string>();
    for (const row of rows) {
      map.set(row.orderItemId, (row._sum.quantity ?? new Prisma.Decimal(0)).toString());
    }
    return map;
  }

  /** @deprecated Use reserveComposition */
  async reserveForOrder(command: ReserveOrderStockCommand): Promise<ReserveOrderStockResult> {
    const result = await this.reserveComposition({
      organizationId: command.organizationId,
      storeId: command.storeId,
      warehouseId: command.warehouseId,
      orderId: command.orderId,
      lines: command.lines.map((l) => ({
        compositionItemId: l.orderItemId,
        itemId: l.itemId,
        quantity: l.quantity,
      })),
    });
    return {
      fullyReserved: result.outcome === 'FULL',
      lines: result.lines.map((l) => ({
        orderItemId: l.compositionItemId,
        itemId: l.itemId,
        requestedQuantity: l.requestedQuantity,
        reservedQuantity: l.reservedQuantity,
        deficitQuantity: l.deficitQuantity,
      })),
    };
  }

  /** @deprecated Use releaseComposition */
  async releaseForOrder(command: ReleaseOrderStockCommand): Promise<void> {
    await this.releaseComposition({
      organizationId: command.organizationId,
      storeId: command.storeId,
      warehouseId: command.warehouseId,
      orderId: command.orderId,
      compositionItemIds: command.orderItemIds,
    });
  }

  /** @deprecated Use sumActiveReservedByCompositionItems */
  async sumActiveReservedByOrderItems(
    organizationId: string,
    orderItemIds: string[],
  ): Promise<Map<string, string>> {
    return this.sumActiveReservedByCompositionItems(organizationId, orderItemIds);
  }

  private async releaseActiveForItems(
    client: Client,
    command: Scope,
    compositionItemIds: string[],
  ): Promise<void> {
    if (compositionItemIds.length === 0) return;
    const active = await client.inventoryReservation.findMany({
      where: {
        organizationId: command.organizationId,
        storeId: command.storeId,
        warehouseId: command.warehouseId,
        orderItemId: { in: compositionItemIds },
        status: 'ACTIVE',
      },
    });
    if (active.length === 0) return;

    const now = new Date();
    const byItem = new Map<string, Prisma.Decimal>();
    for (const reservation of active) {
      await client.inventoryReservation.update({
        where: { id: reservation.id },
        data: { status: 'RELEASED' },
      });
      await client.reservationMovement.create({
        data: {
          id: randomUUID(),
          organizationId: reservation.organizationId,
          storeId: reservation.storeId,
          warehouseId: reservation.warehouseId,
          itemId: reservation.itemId,
          batchId: reservation.batchId,
          reservationId: reservation.id,
          type: 'RELEASE',
          quantity: reservation.quantity,
          sourceDocumentType: 'ORDER',
          sourceDocumentId: command.orderId,
          sourceDocumentItemId: reservation.orderItemId,
          occurredAt: now,
        },
      });
      byItem.set(
        reservation.itemId,
        (byItem.get(reservation.itemId) ?? new Prisma.Decimal(0)).plus(reservation.quantity),
      );
    }
    for (const [itemId, delta] of byItem) {
      await this.adjustReserved(client, command, itemId, delta.negated());
    }
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

  private async adjustReserved(
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
          message: 'Cannot reserve without on-hand stock',
        });
      }
      return;
    }
    const reservedQuantity = balance.reservedQuantity.plus(delta);
    const availableQuantity = balance.onHandQuantity.minus(reservedQuantity);
    if (reservedQuantity.lt(0) || availableQuantity.lt(0)) {
      throw new ConflictException({
        code: 'NEGATIVE_AVAILABLE',
        message: 'Reservation would make available quantity negative',
      });
    }
    await client.inventoryBalance.update({
      where,
      data: { reservedQuantity, availableQuantity },
    });
  }
}
