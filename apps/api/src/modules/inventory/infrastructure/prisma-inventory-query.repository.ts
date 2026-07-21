import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { resolvePrismaClient } from '../../../infrastructure/persistence/prisma-transaction-context';
import type {
  BalanceView,
  BatchView,
  InventoryQueryRepository,
  MovementView,
} from '../application/ports/inventory-query.repository';

@Injectable()
export class PrismaInventoryQueryRepository implements InventoryQueryRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get client() {
    return resolvePrismaClient(this.prisma);
  }

  async listBalances(
    organizationId: string,
    storeId: string,
    warehouseId: string,
  ): Promise<BalanceView[]> {
    const rows = await this.client.inventoryBalance.findMany({
      where: { organizationId, storeId, warehouseId },
      include: { item: true },
      orderBy: { item: { name: 'asc' } },
    });
    return rows.map((row) => ({
      id: row.id,
      itemId: row.itemId,
      onHandQuantity: row.onHandQuantity.toString(),
      reservedQuantity: row.reservedQuantity.toString(),
      availableQuantity: row.availableQuantity.toString(),
      item: { name: row.item.name, code: row.item.code },
    }));
  }

  async listBatches(
    organizationId: string,
    storeId: string,
    warehouseId: string,
  ): Promise<BatchView[]> {
    const rows = await this.client.inventoryBatch.findMany({
      where: { organizationId, storeId, warehouseId },
      include: { item: true },
      orderBy: { receivedAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      itemId: row.itemId,
      initialQuantity: row.initialQuantity.toString(),
      remainingQuantity: row.remainingQuantity.toString(),
      unitCost: row.unitCost.toString(),
      status: row.status,
      expiresAt: row.expiresAt,
      item: { name: row.item.name, code: row.item.code },
    }));
  }

  async listMovements(
    organizationId: string,
    storeId: string,
    warehouseId: string,
  ): Promise<MovementView[]> {
    const rows = await this.client.inventoryMovement.findMany({
      where: { organizationId, storeId, warehouseId },
      include: { item: true },
      orderBy: { occurredAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      quantity: row.quantity.toString(),
      unitCost: row.unitCost?.toString() ?? null,
      itemId: row.itemId,
      occurredAt: row.occurredAt,
      item: { name: row.item.name, code: row.item.code },
    }));
  }
}
