import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { resolvePrismaClient } from '../../../infrastructure/persistence/prisma-transaction-context';
import type {
  OrderPaymentTarget,
  OrdersPaymentPort,
} from '../../payments/application/ports/orders-payment.port';

@Injectable()
export class PrismaOrdersPaymentAdapter implements OrdersPaymentPort {
  constructor(private readonly prisma: PrismaService) {}

  async getOrderPaymentTarget(
    organizationId: string,
    storeId: string,
    orderId: string,
  ): Promise<OrderPaymentTarget | null> {
    const order = await resolvePrismaClient(this.prisma).order.findFirst({
      where: { id: orderId, organizationId, storeId },
      select: { id: true, status: true, storeId: true, plannedPrice: true },
    });
    if (!order) return null;
    return {
      id: order.id,
      status: order.status,
      storeId: order.storeId,
      totalAmount: order.plannedPrice?.toFixed(2) ?? null,
    };
  }

  assertAcceptsPrepayment(target: OrderPaymentTarget): void {
    if (target.status === 'DRAFT' || target.status === 'CANCELLED') {
      throw Object.assign(new Error('Draft or cancelled orders do not accept prepayments'), {
        code: 'ORDER_DOES_NOT_ACCEPT_PREPAYMENT',
      });
    }
  }

  async appendTimelineEvent(input: {
    organizationId: string;
    orderId: string;
    paymentId: string;
    occurredAt: Date;
  }): Promise<void> {
    await resolvePrismaClient(this.prisma).orderTimelineEvent.create({
      data: {
        id: randomUUID(),
        organizationId: input.organizationId,
        orderId: input.orderId,
        type: 'PAYMENT_RECEIVED',
        message: 'Payment received',
        actorMembershipId: null,
        payload: { paymentId: input.paymentId },
        occurredAt: input.occurredAt,
      },
    });
  }
}
