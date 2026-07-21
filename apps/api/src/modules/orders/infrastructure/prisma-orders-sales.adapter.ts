import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { resolvePrismaClient } from '../../../infrastructure/persistence/prisma-transaction-context';
import type {
  OrderForSaleSnapshot,
  OrdersSalesPort,
} from '../application/ports/orders-sales.port';

@Injectable()
export class PrismaOrdersSalesAdapter implements OrdersSalesPort {
  constructor(private readonly prisma: PrismaService) {}

  private client() {
    return resolvePrismaClient(this.prisma);
  }

  async getReadyOrderForSale(
    organizationId: string,
    storeId: string,
    orderId: string,
  ): Promise<OrderForSaleSnapshot | null> {
    const order = await this.client().order.findFirst({
      where: { id: orderId, organizationId, storeId },
      include: {
        composition: { include: { items: { select: { id: true } } } },
        actualComposition: {
          include: {
            items: {
              select: {
                id: true,
                itemId: true,
                actualQuantity: true,
                comment: true,
              },
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
      },
    });

    if (!order) return null;
    if (order.status !== 'READY') return null;
    if (!order.actualComposition || order.actualComposition.items.length < 1) return null;

    return {
      id: order.id,
      organizationId: order.organizationId,
      storeId: order.storeId,
      warehouseId: order.warehouseId,
      number: order.number,
      status: order.status,
      plannedPrice: order.plannedPrice?.toString() ?? null,
      customerNameSnapshot: order.customerNameSnapshot,
      customerPhoneSnapshot: order.customerPhoneSnapshot,
      recipientName: order.recipientName,
      comment: order.comment,
      actualComposition: {
        id: order.actualComposition.id,
        frozenAt: order.actualComposition.frozenAt,
        items: order.actualComposition.items.map((item) => ({
          id: item.id,
          itemId: item.itemId,
          actualQuantity: item.actualQuantity.toString(),
          comment: item.comment,
        })),
      },
      compositionItemIds: order.composition?.items.map((item) => item.id) ?? [],
    };
  }

  async markOrderCompletedFromSale(input: {
    organizationId: string;
    storeId: string;
    orderId: string;
    saleId: string;
  }): Promise<void> {
    const client = this.client();
    const now = new Date();
    const updated = await client.order.updateMany({
      where: {
        id: input.orderId,
        organizationId: input.organizationId,
        storeId: input.storeId,
        status: 'READY',
      },
      data: {
        status: 'COMPLETED',
        completedAt: now,
      },
    });
    if (updated.count === 0) {
      const existing = await client.order.findFirst({
        where: {
          id: input.orderId,
          organizationId: input.organizationId,
          storeId: input.storeId,
        },
      });
      if (existing?.status === 'COMPLETED') return;
      throw new Error('Order is not READY for sale completion');
    }

    await client.orderTimelineEvent.create({
      data: {
        id: randomUUID(),
        organizationId: input.organizationId,
        orderId: input.orderId,
        type: 'SALE_COMPLETED' as const,
        message: 'Sale completed',
        actorMembershipId: null,
        payload: { saleId: input.saleId },
        occurredAt: now,
      },
    });
  }

  async revertOrderToReadyFromSaleAnnul(input: {
    organizationId: string;
    storeId: string;
    orderId: string;
    saleId: string;
  }): Promise<void> {
    const client = this.client();
    const now = new Date();
    const updated = await client.order.updateMany({
      where: {
        id: input.orderId,
        organizationId: input.organizationId,
        storeId: input.storeId,
        status: 'COMPLETED',
      },
      data: {
        status: 'READY',
        completedAt: null,
      },
    });
    if (updated.count === 0) {
      const existing = await client.order.findFirst({
        where: {
          id: input.orderId,
          organizationId: input.organizationId,
          storeId: input.storeId,
        },
      });
      if (existing?.status === 'READY') return;
      throw new Error('Order is not COMPLETED for sale annulment');
    }

    await client.orderTimelineEvent.create({
      data: {
        id: randomUUID(),
        organizationId: input.organizationId,
        orderId: input.orderId,
        type: 'SALE_ANNULLED' as const,
        message: 'Sale annulled',
        actorMembershipId: null,
        payload: { saleId: input.saleId },
        occurredAt: now,
      },
    });
  }
}
