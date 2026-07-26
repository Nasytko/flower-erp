import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import {
  getActivePrismaTx,
  type PrismaTransactionClient,
} from '../../../infrastructure/persistence/prisma-transaction-context';
import type {
  AdjustGoodsReceiptItemCommand,
  InventoryPostingPort,
  PostGoodsReceiptCommand,
  ReverseGoodsReceiptCommand,
} from '../application/ports/inventory-posting.port';

type Client = PrismaClient | PrismaTransactionClient;

@Injectable()
export class PrismaInventoryPostingAdapter implements InventoryPostingPort {
  constructor(private readonly prisma: PrismaService) {}

  async postGoodsReceipt(command: PostGoodsReceiptCommand): Promise<void> {
    const work = async (client: Client) => {
      if (command.idempotencyKey) {
        const previous = await client.postingIdempotencyKey.findFirst({
          where: { organizationId: command.organizationId, scope: 'goods-receipt-post', key: command.idempotencyKey },
        });
        if (previous) {
          if (previous.documentId === command.goodsReceiptId) return;
          throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED', message: 'Idempotency key belongs to another document' });
        }
        await client.postingIdempotencyKey.create({
          data: { id: randomUUID(), organizationId: command.organizationId, scope: 'goods-receipt-post', key: command.idempotencyKey, documentId: command.goodsReceiptId },
        });
      }

      for (const line of command.lines) {
        const quantity = new Prisma.Decimal(line.acceptedQuantity);
        if (quantity.lte(0)) continue;
        const existing = await client.inventoryMovement.findFirst({
          where: { organizationId: command.organizationId, sourceDocumentType: 'GOODS_RECEIPT_ITEM', sourceDocumentItemId: line.goodsReceiptItemId, type: 'RECEIPT' },
        });
        if (existing) throw new ConflictException({ code: 'GOODS_RECEIPT_ALREADY_POSTED', message: 'Receipt item already posted' });

        const expiresAt =
          line.itemType === 'FLOWER' && line.defaultShelfLifeDays
            ? new Date(line.receivedAt.getTime() + line.defaultShelfLifeDays * 86_400_000)
            : null;
        const batch = await client.inventoryBatch.create({
          data: {
            id: randomUUID(), organizationId: command.organizationId, storeId: command.storeId,
            warehouseId: command.warehouseId, itemId: line.itemId, goodsReceiptItemId: line.goodsReceiptItemId,
            receivedAt: line.receivedAt, initialQuantity: quantity, remainingQuantity: quantity,
            unitCost: new Prisma.Decimal(line.actualUnitPrice), expiresAt,
          },
        });
        await client.inventoryMovement.create({
          data: {
            id: randomUUID(), organizationId: command.organizationId, storeId: command.storeId,
            warehouseId: command.warehouseId, itemId: line.itemId, batchId: batch.id, type: 'RECEIPT',
            quantity, unitCost: new Prisma.Decimal(line.actualUnitPrice), sourceDocumentType: 'GOODS_RECEIPT_ITEM',
            sourceDocumentId: command.goodsReceiptId, sourceDocumentItemId: line.goodsReceiptItemId,
            occurredAt: line.receivedAt,
          },
        });
        await this.adjustBalance(client, command, line.itemId, quantity);
      }
    };
    const active = getActivePrismaTx();
    if (active) return work(active);
    return this.prisma.$transaction(work);
  }

  async reverseGoodsReceipt(command: ReverseGoodsReceiptCommand): Promise<void> {
    const work = async (client: Client) => {
      if (command.idempotencyKey) {
        const previous = await client.postingIdempotencyKey.findFirst({
          where: { organizationId: command.organizationId, scope: 'goods-receipt-reverse', key: command.idempotencyKey },
        });
        if (previous) {
          if (previous.documentId === command.goodsReceiptId) return;
          throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED', message: 'Idempotency key belongs to another document' });
        }
        await client.postingIdempotencyKey.create({
          data: { id: randomUUID(), organizationId: command.organizationId, scope: 'goods-receipt-reverse', key: command.idempotencyKey, documentId: command.goodsReceiptId },
        });
      }
      const batches = await client.inventoryBatch.findMany({
        where: {
          organizationId: command.organizationId,
          storeId: command.storeId,
          warehouseId: command.warehouseId,
          goodsReceiptItemId: { in: command.goodsReceiptItemIds },
        },
      });
      for (const batch of batches) {
        if (!batch.goodsReceiptItemId) {
          throw new ConflictException({ code: 'INVALID_BATCH_SOURCE', message: 'Goods receipt batch is missing goodsReceiptItemId' });
        }
        if (!batch.remainingQuantity.equals(batch.initialQuantity)) {
          throw new ConflictException({ code: 'BATCH_ALREADY_USED', message: 'A receipt can be reversed only while all batches are unused' });
        }
        const receipt = await client.inventoryMovement.findFirstOrThrow({
          where: { organizationId: command.organizationId, batchId: batch.id, type: 'RECEIPT' },
        });
        const reversal = await client.inventoryMovement.findFirst({
          where: { organizationId: command.organizationId, sourceDocumentType: 'GOODS_RECEIPT_ITEM', sourceDocumentItemId: batch.goodsReceiptItemId, type: 'RECEIPT_REVERSAL' },
        });
        if (reversal) throw new ConflictException({ code: 'GOODS_RECEIPT_ALREADY_REVERSED', message: 'Receipt item already reversed' });
        await this.adjustBalance(client, command, batch.itemId, batch.initialQuantity.negated());
        await client.inventoryMovement.create({
          data: {
            id: randomUUID(), organizationId: command.organizationId, storeId: command.storeId, warehouseId: command.warehouseId,
            itemId: batch.itemId, batchId: batch.id, type: 'RECEIPT_REVERSAL', quantity: batch.initialQuantity.negated(),
            unitCost: batch.unitCost, sourceDocumentType: 'GOODS_RECEIPT_ITEM', sourceDocumentId: command.goodsReceiptId,
            sourceDocumentItemId: batch.goodsReceiptItemId, reversalOfMovementId: receipt.id, occurredAt: new Date(),
          },
        });
        await client.inventoryBatch.update({ where: { id: batch.id }, data: { remainingQuantity: new Prisma.Decimal(0), status: 'REVERSED' } });
      }
    };
    const active = getActivePrismaTx();
    if (active) return work(active);
    return this.prisma.$transaction(work);
  }

  async adjustGoodsReceiptItem(command: AdjustGoodsReceiptItemCommand): Promise<void> {
    const work = async (client: Client) => {
      const batch = await client.inventoryBatch.findFirst({
        where: {
          organizationId: command.organizationId,
          storeId: command.storeId,
          warehouseId: command.warehouseId,
          goodsReceiptItemId: command.goodsReceiptItemId,
        },
      });
      if (!batch) {
        throw new ConflictException({
          code: 'BATCH_NOT_FOUND',
          message: 'Inventory batch for receipt item was not found',
        });
      }
      if (batch.status === 'REVERSED') {
        throw new ConflictException({
          code: 'BATCH_REVERSED',
          message: 'Cannot adjust a reversed receipt batch',
        });
      }

      const nextQty = new Prisma.Decimal(command.acceptedQuantity);
      const nextCost = new Prisma.Decimal(command.actualUnitPrice);
      if (nextQty.lte(0)) {
        throw new ConflictException({
          code: 'INVALID_RECEIPT_QUANTITY',
          message: 'Corrected quantity must be greater than zero',
        });
      }
      if (nextCost.lt(0)) {
        throw new ConflictException({
          code: 'INVALID_UNIT_PRICE',
          message: 'Unit cost must be a non-negative decimal',
        });
      }

      const delta = nextQty.minus(batch.initialQuantity);
      const nextRemaining = batch.remainingQuantity.plus(delta);
      if (nextRemaining.lt(0)) {
        throw new ConflictException({
          code: 'BATCH_ALREADY_USED',
          message:
            'Cannot reduce quantity below what was already issued from this batch',
        });
      }

      if (!delta.equals(0)) {
        const movementType = delta.gt(0) ? 'COUNT_ADJUSTMENT_IN' : 'COUNT_ADJUSTMENT_OUT';
        const movementQty = delta.abs();
        await client.inventoryMovement.create({
          data: {
            id: randomUUID(),
            organizationId: command.organizationId,
            storeId: command.storeId,
            warehouseId: command.warehouseId,
            itemId: command.itemId,
            batchId: batch.id,
            type: movementType,
            quantity: movementQty,
            unitCost: nextCost,
            sourceDocumentType: 'GOODS_RECEIPT_ITEM',
            sourceDocumentId: command.goodsReceiptId,
            // Each correction is its own movement — goodsReceiptItemId is already used by RECEIPT.
            sourceDocumentItemId: randomUUID(),
            occurredAt: command.occurredAt,
          },
        });
        await this.adjustBalance(client, command, command.itemId, delta);
      }

      await client.inventoryBatch.update({
        where: { id: batch.id },
        data: {
          initialQuantity: nextQty,
          remainingQuantity: nextRemaining,
          unitCost: nextCost,
          status: nextRemaining.gt(0) ? 'ACTIVE' : 'DEPLETED',
        },
      });
    };
    const active = getActivePrismaTx();
    if (active) return work(active);
    return this.prisma.$transaction(work);
  }

  private async adjustBalance(
    client: Client,
    command: Pick<PostGoodsReceiptCommand, 'organizationId' | 'storeId' | 'warehouseId'>,
    itemId: string,
    delta: Prisma.Decimal,
  ): Promise<void> {
    await client.$queryRaw`SELECT "id" FROM "inventory_balances" WHERE "organization_id" = ${command.organizationId}::uuid AND "store_id" = ${command.storeId}::uuid AND "warehouse_id" = ${command.warehouseId}::uuid AND "item_id" = ${itemId}::uuid FOR UPDATE`;
    const where = { organizationId_storeId_warehouseId_itemId: { organizationId: command.organizationId, storeId: command.storeId, warehouseId: command.warehouseId, itemId } };
    const balance = await client.inventoryBalance.findUnique({ where });
    if (!balance) {
      if (delta.lt(0)) throw new ConflictException({ code: 'NEGATIVE_BALANCE', message: 'Inventory balance cannot become negative' });
      await client.inventoryBalance.create({ data: { id: randomUUID(), organizationId: command.organizationId, storeId: command.storeId, warehouseId: command.warehouseId, itemId, onHandQuantity: delta, reservedQuantity: 0, availableQuantity: delta } });
      return;
    }
    const onHandQuantity = balance.onHandQuantity.plus(delta);
    const availableQuantity = onHandQuantity.minus(balance.reservedQuantity);
    if (onHandQuantity.lt(0) || availableQuantity.lt(0)) throw new ConflictException({ code: 'NEGATIVE_BALANCE', message: 'Inventory balance cannot become negative' });
    await client.inventoryBalance.update({ where, data: { onHandQuantity, availableQuantity } });
  }
}
