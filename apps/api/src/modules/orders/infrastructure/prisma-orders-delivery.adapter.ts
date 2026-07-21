import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { resolvePrismaClient } from '../../../infrastructure/persistence/prisma-transaction-context';
import type {
  OrderDeliverySnapshot,
  OrdersDeliveryPort,
} from '../../delivery/application/ports/orders-delivery.port';

@Injectable()
export class PrismaOrdersDeliveryAdapter implements OrdersDeliveryPort {
  constructor(private readonly prisma: PrismaService) {}

  async getOrderForDelivery(
    organizationId: string,
    storeId: string,
    orderId: string,
  ): Promise<OrderDeliverySnapshot | null> {
    const order = await resolvePrismaClient(this.prisma).order.findFirst({
      where: { id: orderId, organizationId, storeId },
      select: {
        id: true,
        organizationId: true,
        storeId: true,
        number: true,
        status: true,
        type: true,
        readyAt: true,
        recipientName: true,
        recipientPhone: true,
        comment: true,
        plannedPrice: true,
      },
    });
    if (!order) return null;
    return {
      id: order.id,
      organizationId: order.organizationId,
      storeId: order.storeId,
      number: order.number,
      status: order.status,
      type: order.type,
      readyAt: order.readyAt,
      recipientName: order.recipientName,
      recipientPhone: order.recipientPhone,
      comment: order.comment,
      plannedPrice: order.plannedPrice?.toFixed(2) ?? null,
    };
  }

  assertFulfillmentChange(
    order: OrderDeliverySnapshot,
    nextType: 'PICKUP' | 'DELIVERY',
  ): void {
    if (order.type === nextType) return;
    if (order.status === 'CANCELLED' || order.status === 'COMPLETED') {
      throw Object.assign(new Error('Cannot change fulfillment on terminal order'), {
        code: 'FULFILLMENT_CHANGE_FORBIDDEN',
      });
    }
  }

  async appendOrderTimeline(input: {
    organizationId: string;
    orderId: string;
    type: 'DELIVERY_CREATED' | 'DELIVERY_COMPLETED' | 'DELIVERY_CANCELLED';
    message: string;
    payload?: Record<string, unknown> | null;
    occurredAt: Date;
  }): Promise<void> {
    await resolvePrismaClient(this.prisma).orderTimelineEvent.create({
      data: {
        id: randomUUID(),
        organizationId: input.organizationId,
        orderId: input.orderId,
        type: input.type,
        message: input.message,
        actorMembershipId: null,
        payload: (input.payload ?? undefined) as import('@prisma/client').Prisma.InputJsonValue | undefined,
        occurredAt: input.occurredAt,
      },
    });
  }

  isOrderReady(order: OrderDeliverySnapshot): boolean {
    return order.status === 'READY' || order.status === 'COMPLETED';
  }

  async getOrderReadinessByIds(
    organizationId: string,
    storeId: string,
    orderIds: string[],
  ): Promise<Map<string, { status: string; number: string; readyAt: Date | null }>> {
    if (orderIds.length === 0) return new Map();
    const rows = await resolvePrismaClient(this.prisma).order.findMany({
      where: { organizationId, storeId, id: { in: orderIds } },
      select: { id: true, status: true, number: true, readyAt: true },
    });
    return new Map(
      rows.map((r) => [r.id, { status: r.status, number: r.number, readyAt: r.readyAt }]),
    );
  }
}
