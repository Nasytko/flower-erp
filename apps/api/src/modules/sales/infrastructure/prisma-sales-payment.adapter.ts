import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { resolvePrismaClient } from '../../../infrastructure/persistence/prisma-transaction-context';
import type {
  SalePaymentTarget,
  SalesPaymentPort,
} from '../../payments/application/ports/sales-payment.port';

@Injectable()
export class PrismaSalesPaymentAdapter implements SalesPaymentPort {
  constructor(private readonly prisma: PrismaService) {}

  async getSalePaymentTarget(
    organizationId: string,
    storeId: string,
    saleId: string,
  ): Promise<SalePaymentTarget | null> {
    const sale = await resolvePrismaClient(this.prisma).sale.findFirst({
      where: { id: saleId, organizationId, storeId },
      select: { id: true, status: true, storeId: true, netAmount: true, orderId: true },
    });
    if (!sale) return null;
    return {
      id: sale.id,
      status: sale.status,
      storeId: sale.storeId,
      netAmount: sale.netAmount.toFixed(2),
      orderId: sale.orderId,
    };
  }

  async findActiveSaleIdByOrderId(
    organizationId: string,
    storeId: string,
    orderId: string,
  ): Promise<string | null> {
    const sale = await resolvePrismaClient(this.prisma).sale.findFirst({
      where: { organizationId, storeId, orderId, status: { not: 'ANNULLED' } },
      select: { id: true },
    });
    return sale?.id ?? null;
  }

  assertAcceptsPayment(target: SalePaymentTarget): void {
    if (target.status !== 'COMPLETED') {
      throw Object.assign(new Error('Only completed sales accept payments'), {
        code: 'SALE_DOES_NOT_ACCEPT_PAYMENT',
      });
    }
  }

  async appendTimelineEvent(input: {
    organizationId: string;
    saleId: string;
    paymentId: string;
    status: string;
    occurredAt: Date;
  }): Promise<void> {
    const isReceived = input.status === 'COMPLETED';
    await resolvePrismaClient(this.prisma).saleTimelineEvent.create({
      data: {
        id: randomUUID(),
        organizationId: input.organizationId,
        saleId: input.saleId,
        type: isReceived ? 'PAYMENT_RECEIVED' : 'PAYMENT_STATUS_CHANGED',
        message: isReceived ? 'Payment received' : `Payment ${input.status.toLowerCase()}`,
        actorMembershipId: null,
        payload: { paymentId: input.paymentId, status: input.status },
        occurredAt: input.occurredAt,
      },
    });
  }
}
